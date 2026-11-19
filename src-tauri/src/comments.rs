use crate::{
    youtube_search::{avatar, client_version, initial_data, public_page, read_page, text},
    AppData, Result,
};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use tauri::State;
fn find<'a>(value: &'a Value, key: &str, depth: usize) -> Option<&'a Value> {
    if depth == 0 {
        return None;
    }
    match value {
        Value::Object(map) => map
            .get(key)
            .or_else(|| map.values().find_map(|v| find(v, key, depth - 1))),
        Value::Array(items) => items.iter().find_map(|v| find(v, key, depth - 1)),
        _ => None,
    }
}
fn section(value: &Value) -> Option<&Value> {
    if let Some(s) = value.get("itemSectionRenderer") {
        if s["targetId"] == "comments-section" {
            return Some(s);
        }
    }
    if let Some(panel) = value.get("engagementPanelSectionListRenderer") {
        if panel["targetId"] == "engagement-panel-comments-section" && token(&panel["content"]).is_some() {
            return Some(&panel["content"]);
        }
    }
    match value {
        Value::Object(m) => m.values().find_map(section),
        Value::Array(a) => a.iter().find_map(section),
        _ => None,
    }
}
fn token(value: &Value) -> Option<&str> {
    find(value, "continuationCommand", 16)?["token"].as_str()
}
fn cursor(token: &str, version: &str, id: &str) -> Value {
    json!({"token":token,"version":version,"videoId":id})
}
async fn next(client: &reqwest::Client, c: &Value, id: &str) -> Result<Value> {
    let t = c["token"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 16384 && s.is_ascii())
        .ok_or("Invalid comments cursor.")?;
    let v = c["version"]
        .as_str()
        .filter(|s| {
            !s.is_empty() && s.len() <= 32 && s.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        })
        .ok_or("Invalid comments cursor.")?;
    if c["videoId"] != id {
        return Err("This comment cursor belongs to another video.".into());
    }
    let body = read_page(client.post("https://www.youtube.com/youtubei/v1/next")
        .header("Origin", "https://www.youtube.com")
        .header("Referer", format!("https://www.youtube.com/watch?v={id}"))
        .header("X-YouTube-Client-Name", "1")
        .header("X-YouTube-Client-Version", v)
        .header("Accept", "application/json")
        .json(&json!({"context":{"client":{"clientName":"WEB","clientVersion":v,"hl":"en"}},"continuation":t})))
        .await.map_err(|_| "YouTube did not return comments. Try again later or open its original comments.")?;
    serde_json::from_str(
        body.trim_start()
            .strip_prefix(")]}'")
            .unwrap_or(body.trim_start())
            .trim_start(),
    )
    .map_err(|_| "YouTube comments are temporarily unavailable. Try again.".into())
}
fn rows<'a>(value: &'a Value, result: &mut Vec<&'a Value>) {
    match value {
        Value::Object(m) => {
            for (k, v) in m {
                if matches!(
                    k.as_str(),
                    "appendContinuationItemsAction" | "reloadContinuationItemsCommand"
                ) {
                    if let Some(a) = v["continuationItems"].as_array() {
                        result.extend(a)
                    }
                } else {
                    rows(v, result)
                }
            }
        }
        Value::Array(a) => {
            for v in a {
                rows(v, result)
            }
        }
        _ => {}
    }
}
fn parse(body: &Value, version: &str, id: &str) -> Value {
    let mut entities = HashMap::new();
    if let Some(mutations) = body
        .pointer("/frameworkUpdates/entityBatchUpdate/mutations")
        .and_then(Value::as_array)
    {
        for m in mutations {
            if let Some(entity) = m.pointer("/payload/commentEntityPayload") {
                if let Some(key) = entity["key"].as_str() {
                    entities.insert(key, entity);
                }
            }
        }
    }
    let mut entries = Vec::new();
    rows(body, &mut entries);
    let header = find(body, "commentsHeaderRenderer", 32);
    let mut sorts = serde_json::Map::new();
    if let Some(menu) = header
        .and_then(|h| h.pointer("/sortMenu/sortFilterSubMenuRenderer/subMenuItems"))
        .and_then(Value::as_array)
    {
        for item in menu {
            if let (Some(title), Some(t)) = (item["title"].as_str(), token(item)) {
                let key = if title.to_lowercase().contains("new") {
                    "newest"
                } else {
                    "top"
                };
                sorts.insert(key.into(), cursor(t, version, id));
            }
        }
    }
    let mut items = Vec::new();
    let mut seen = HashSet::new();
    let mut continuation = None;
    for row in entries {
        if let Some(t) = row.get("continuationItemRenderer").and_then(token) {
            continuation = Some(cursor(t, version, id));
            continue;
        }
        let thread = row.get("commentThreadRenderer").unwrap_or(row);
        let model =
            find(thread, "commentViewModel", 5).and_then(|v| v.get("commentViewModel").or(Some(v)));
        let entity = model
            .and_then(|m| m["commentKey"].as_str())
            .and_then(|key| entities.get(key))
            .copied();
        let legacy = find(thread, "commentRenderer", 5);
        let mut comment = if let Some(e) = entity {
            let p = &e["properties"];
            let a = &e["author"];
            json!({"id":p["commentId"].as_str().unwrap_or_default(),"author":a["displayName"].as_str().unwrap_or("YouTube viewer"),"channelId":a["channelId"].as_str().unwrap_or_default(),"avatar":avatar(&a["avatarThumbnailUrl"]).unwrap_or_default(),"text":p["content"]["content"].as_str().unwrap_or_default(),"published":p["publishedTime"].as_str().unwrap_or_default(),"likes":e["toolbar"]["likeCountNotliked"].as_str().unwrap_or_default(),"verified":a["isVerified"]==true,"creator":a["isCreator"]==true,"pinned":model.and_then(|m|m["pinnedText"].as_str()).unwrap_or_default()})
        } else if let Some(e) = legacy {
            json!({"id":e["commentId"].as_str().unwrap_or_default(),"author":text(&e["authorText"]),"channelId":e["authorEndpoint"]["browseEndpoint"]["browseId"].as_str().unwrap_or_default(),"avatar":e["authorThumbnail"]["thumbnails"].as_array().and_then(|a|a.last()).and_then(|v|avatar(&v["url"])).unwrap_or_default(),"text":text(&e["contentText"]),"published":text(&e["publishedTimeText"]),"likes":text(&e["voteCount"]),"verified":false,"creator":e["authorIsChannelOwner"]==true,"pinned":text(&e["pinnedCommentBadge"]["pinnedCommentBadgeRenderer"]["label"])})
        } else {
            continue;
        };
        let cid = comment["id"].as_str().unwrap_or_default().to_owned();
        if cid.is_empty()
            || !seen.insert(cid)
            || comment["text"].as_str().unwrap_or_default().is_empty()
        {
            continue;
        }
        let replies = thread.pointer("/replies/commentRepliesRenderer");
        comment["replyLabel"] = json!(replies
            .map(|v| text(&v["viewReplies"]["buttonRenderer"]["text"]))
            .unwrap_or_default());
        comment["replyCursor"] = replies
            .and_then(token)
            .map(|t| cursor(t, version, id))
            .unwrap_or(Value::Null);
        items.push(comment);
    }
    json!({"items":items,"next":continuation,"sorts":sorts,"count":header.map(|h|text(&h["countText"])).unwrap_or_default(),"unavailable":false})
}
#[tauri::command]
pub async fn video_comments(
    state: State<'_, AppData>,
    id: String,
    cursor: Option<Value>,
    sort: String,
) -> Result<Value> {
    if id.len() != 11
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
        || !matches!(sort.as_str(), "top" | "newest")
    {
        return Err("Invalid comments request.".into());
    }
    if let Some(c) = cursor {
        let body = next(&state.client, &c, &id).await?;
        return Ok(parse(&body, c["version"].as_str().unwrap(), &id));
    }
    let url = reqwest::Url::parse_with_params(
        "https://www.youtube.com/watch",
        &[("v", id.as_str()), ("hl", "en")],
    )
    .map_err(|_| "Invalid video.")?;
    let html = public_page(&state.client, url).await
        .map_err(|_| "YouTube did not return the public watch page. Try opening its original comments.")?;
    let data = initial_data(&html).map_err(|_| "YouTube did not return readable comments.")?;
    let version = client_version(&html);
    let Some(t) = section(&data).and_then(token) else {
        return Ok(
            json!({"items":[],"next":null,"sorts":{},"count":"","unavailable":true,"message":"YouTube did not list public comments for this video."}),
        );
    };
    let body = next(&state.client, &self::cursor(t, version, &id), &id).await?;
    let page = parse(&body, version, &id);
    if sort == "newest" {
        if let Some(c) = page["sorts"].get("newest") {
            let Ok(body) = next(&state.client, c, &id).await else {
                let mut fallback = page;
                fallback["message"] = json!("Newest comments could not load. Showing top comments.");
                return Ok(fallback);
            };
            let mut sorted = parse(&body, version, &id);
            sorted["sorts"] = page["sorts"].clone();
            sorted["count"] = page["count"].clone();
            return Ok(sorted);
        }
    }
    Ok(page)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn finds_the_comments_engagement_panel_continuation() {
        let watch = json!({"engagementPanels":[
            {"engagementPanelSectionListRenderer":{"targetId":"engagement-panel-searchable-transcript","content":{"continuationCommand":{"token":"transcript"}}}},
            {"engagementPanelSectionListRenderer":{"targetId":"engagement-panel-comments-section","content":{"sectionListRenderer":{"contents":[{"continuationItemRenderer":{"continuationEndpoint":{"continuationCommand":{"token":"comments"}}}}]}}}}
        ]});
        assert_eq!(section(&watch).and_then(token), Some("comments"));
    }

    #[test]
    fn resolves_entity_comments_and_preserves_thread_continuations() {
        let body = json!({"onResponseReceivedEndpoints":[{"reloadContinuationItemsCommand":{"continuationItems":[{"commentThreadRenderer":{"commentViewModel":{"commentViewModel":{"commentKey":"key","pinnedText":"Pinned"}},"replies":{"commentRepliesRenderer":{"viewReplies":{"buttonRenderer":{"text":{"simpleText":"2 replies"}}},"contents":[{"continuationItemRenderer":{"continuationEndpoint":{"continuationCommand":{"token":"replies"}}}}]}}}},{"continuationItemRenderer":{"continuationEndpoint":{"continuationCommand":{"token":"next-page"}}}}]}}],"frameworkUpdates":{"entityBatchUpdate":{"mutations":[{"payload":{"commentEntityPayload":{"key":"key","properties":{"commentId":"c1","content":{"content":"Hello world"},"publishedTime":"Today"},"author":{"displayName":"Viewer","channelId":"UC123"},"toolbar":{"likeCountNotliked":"12"}}}}]}}});
        let page = parse(&body, "2.1", "jNQXAC9IVRw");
        assert_eq!(page["items"][0]["text"], "Hello world");
        assert_eq!(page["items"][0]["replyCursor"]["token"], "replies");
        assert_eq!(page["next"]["token"], "next-page");
    }
}
