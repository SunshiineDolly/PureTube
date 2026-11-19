use crate::{AppData, Result};
use reqwest::Url;
use serde_json::{json, Value};
use std::collections::HashSet;
use tauri::State;

fn search_url(query: &str, filter: &str) -> Result<Url> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 256 {
        return Err("Enter between 1 and 256 characters to search.".into());
    }
    let mut url = Url::parse_with_params(
        "https://www.youtube.com/results",
        &[("search_query", query)],
    )
    .map_err(|_| "Could not create the search request.")?;
    let code = match filter {
        "all" | "scheduled" => None,
        "live" => Some("EgJAAQ=="),
        "latest" => Some("CAI="),
        _ => return Err("Unknown search filter.".into()),
    };
    if let Some(code) = code {
        url.query_pairs_mut().append_pair("sp", code);
    }
    Ok(url)
}

fn text(value: &Value) -> String {
    value["simpleText"]
        .as_str()
        .map(str::to_owned)
        .unwrap_or_else(|| {
            value["runs"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|run| run["text"].as_str())
                .collect()
        })
}

fn valid_id(id: &str, len: usize) -> bool {
    id.len() == len
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn avatar(value: &Value) -> Option<String> {
    let raw = value.as_str()?;
    let normalized = if raw.starts_with("//") {
        format!("https:{raw}")
    } else {
        raw.to_owned()
    };
    let url = Url::parse(&normalized).ok()?;
    let host = url.host_str()?;
    (url.scheme() == "https"
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && (host.ends_with(".ggpht.com") || host.ends_with(".googleusercontent.com")))
    .then(|| url.to_string())
}

fn thumbnail(sources: &Value, id: &str) -> String {
    sources
        .as_array()
        .into_iter()
        .flatten()
        .rev()
        .filter_map(|source| source["url"].as_str())
        .find(|value| {
            reqwest::Url::parse(value).is_ok_and(|url| {
                url.scheme() == "https"
                    && url.host_str() == Some("i.ytimg.com")
                    && url.username().is_empty()
                    && url.password().is_none()
                    && (url.path().starts_with(&format!("/vi/{id}/"))
                        || url.path().starts_with(&format!("/vi_webp/{id}/")))
            })
        })
        .map(str::to_owned)
        .unwrap_or_else(|| format!("https://i.ytimg.com/vi/{id}/hqdefault.jpg"))
}

fn find_named<'a>(value: &'a Value, key: &str, depth: u8) -> Option<&'a Value> {
    if depth == 0 {
        return None;
    }
    match value {
        Value::Object(map) => map
            .get(key)
            .or_else(|| map.values().find_map(|v| find_named(v, key, depth - 1))),
        Value::Array(items) => items.iter().find_map(|v| find_named(v, key, depth - 1)),
        _ => None,
    }
}
fn find_channel(value: &Value, depth: u8) -> Option<&str> {
    if depth == 0 {
        return None;
    }
    if let Some(id) = channel_key(&value["browseEndpoint"]["browseId"]) {
        return Some(id);
    }
    match value {
        Value::Object(map) => map.values().find_map(|v| find_channel(v, depth - 1)),
        Value::Array(items) => items.iter().find_map(|v| find_channel(v, depth - 1)),
        _ => None,
    }
}
fn find_avatar(value: &Value, depth: u8) -> Option<String> {
    if depth == 0 {
        return None;
    }
    if let Some(url) = value.get("url").and_then(avatar) {
        return Some(url);
    }
    match value {
        Value::Object(map) => map.values().find_map(|v| find_avatar(v, depth - 1)),
        Value::Array(items) => items.iter().find_map(|v| find_avatar(v, depth - 1)),
        _ => None,
    }
}

fn lockup_video(lockup: &Value) -> Option<Value> {
    if lockup["contentType"] != "LOCKUP_CONTENT_TYPE_VIDEO" {
        return None;
    }
    let id = lockup["contentId"].as_str().filter(|id| valid_id(id, 11))?;
    let meta = &lockup["metadata"]["lockupMetadataViewModel"];
    let title = meta["title"]["content"]
        .as_str()
        .filter(|s| !s.trim().is_empty())?;
    let rows = meta
        .pointer("/metadata/contentMetadataViewModel/metadataRows")
        .and_then(Value::as_array);
    let fields = rows
        .into_iter()
        .flatten()
        .filter_map(|row| row["metadataParts"].as_array())
        .flatten()
        .filter_map(|part| part["text"]["content"].as_str())
        .collect::<Vec<_>>();
    let label = fields
        .iter()
        .find(|label| label.ends_with("ago"))
        .copied()
        .unwrap_or_default();
    let views = rows
        .into_iter()
        .flatten()
        .filter_map(|row| row["metadataParts"].as_array())
        .flatten()
        .find(|part| {
            part["accessibilityLabel"]
                .as_str()
                .is_some_and(|s| s.contains("views"))
                || part["text"]["content"]
                    .as_str()
                    .is_some_and(|s| s.ends_with(" views"))
        })
        .and_then(|part| part["text"]["content"].as_str())
        .map(|s| {
            if s.contains("views") {
                s.to_owned()
            } else {
                format!("{s} views")
            }
        })
        .unwrap_or_default();
    let name = fields.first().copied().unwrap_or_default();
    let owner = find_named(&meta["image"], "showDialogCommand", 20)
        .map(|dialog| json!({"runs":[{"navigationEndpoint":{"showDialogCommand":dialog}}]}))
        .unwrap_or(Value::Null);
    let creators = credited_creators(&owner);
    let channel = creators
        .first()
        .and_then(|c| c["id"].as_str())
        .or_else(|| find_channel(meta, 20))
        .unwrap_or_default();
    let name = if channel.is_empty() {
        ""
    } else {
        creators
            .first()
            .and_then(|c| c["name"].as_str())
            .unwrap_or(name)
    };
    let overlays = &lockup["contentImage"]["thumbnailViewModel"]["overlays"];
    let badges = find_named(overlays, "thumbnailBottomOverlayViewModel", 10)
        .and_then(|v| v["badges"].as_array())
        .or_else(|| {
            find_named(overlays, "thumbnailOverlayBadgeViewModel", 10)
                .and_then(|v| v["thumbnailBadges"].as_array())
        });
    let styles = badges
        .into_iter()
        .flatten()
        .filter_map(|b| b["thumbnailBadgeViewModel"]["badgeStyle"].as_str())
        .collect::<Vec<_>>();
    if styles.iter().any(|s| s.ends_with("_SHORTS"))
        || title
            .split_whitespace()
            .any(|w| w.eq_ignore_ascii_case("#shorts"))
    {
        return None;
    }
    let live = styles.iter().any(|s| s.ends_with("_LIVE"));
    let upcoming = styles.iter().any(|s| s.ends_with("_UPCOMING"));
    let duration = badges
        .into_iter()
        .flatten()
        .filter_map(|b| b["thumbnailBadgeViewModel"]["text"].as_str())
        .find(|s| s.contains(':'))
        .and_then(|s| {
            s.split(':').try_fold(0_u32, |sum, part| {
                sum.checked_mul(60)?.checked_add(part.parse().ok()?)
            })
        })
        .unwrap_or(0);
    Some(
        json!({"id":id,"title":title,"channelId":channel,"channel":name,"creators":creators,
        "channelImage":find_avatar(&meta["image"],14).unwrap_or_default(),"description":"","date":"","publishedLabel":label,"views":views,
        "duration":duration,"live":live,"upcoming":upcoming,"shorts":false,"paid":false,"embeddable":true,
        "image":thumbnail(&lockup["contentImage"]["thumbnailViewModel"]["image"]["sources"],id)}),
    )
}

fn channel_key(value: &Value) -> Option<&str> {
    value
        .as_str()
        .filter(|id| id.starts_with("UC") && valid_id(id, 24))
}
fn credited_creators(owner: &Value) -> Vec<Value> {
    let mut seen = HashSet::new();
    owner["runs"].as_array().into_iter().flatten()
        .filter_map(|run|run.pointer("/navigationEndpoint/showDialogCommand/panelLoadingStrategy/inlineContent/dialogViewModel/customContent/listViewModel/listItems"))
        .filter_map(Value::as_array).flatten().filter_map(|item|{
            let item=&item["listItemViewModel"];
            let id=channel_key(item.pointer("/rendererContext/commandContext/onTap/innertubeCommand/browseEndpoint/browseId")?)?;
            let name=item["title"]["content"].as_str().filter(|s|!s.is_empty())?;
            if !seen.insert(id){return None;}
            let image=item.pointer("/leadingAccessory/avatarViewModel/image/sources/0/url").and_then(avatar).unwrap_or_default();
            Some(json!({"id":id,"name":name,"image":image}))
        }).take(12).collect()
}

fn video(renderer: &Value) -> Option<Value> {
    let id = renderer["videoId"].as_str()?;
    let title = text(&renderer["title"]);
    if !valid_id(id, 11) || title.trim().is_empty() {
        return None;
    }
    let owner = &renderer["ownerText"];
    let creators = credited_creators(owner);
    let channel_id = [
        owner,
        &renderer["longBylineText"],
        &renderer["shortBylineText"],
    ]
    .iter()
    .filter_map(|text| text["runs"].as_array())
    .flatten()
    .find_map(|run| channel_key(&run["navigationEndpoint"]["browseEndpoint"]["browseId"]))
    .or_else(|| channel_key(&creators.first()?["id"]))
    .unwrap_or_default();
    let channel = creators
        .first()
        .and_then(|c| c["name"].as_str())
        .map(str::to_owned)
        .unwrap_or_else(|| text(owner));
    let live = renderer["badges"].as_array().is_some_and(|badges| {
        badges
            .iter()
            .any(|badge| badge["metadataBadgeRenderer"]["style"] == "BADGE_STYLE_TYPE_LIVE_NOW")
    }) || renderer["thumbnailOverlays"]
        .as_array()
        .is_some_and(|overlays| {
            overlays
                .iter()
                .any(|overlay| overlay["thumbnailOverlayTimeStatusRenderer"]["style"] == "LIVE")
        });
    let short = renderer
        .pointer("/navigationEndpoint/reelWatchEndpoint")
        .is_some()
        || renderer["thumbnailOverlays"]
            .as_array()
            .is_some_and(|items| {
                items
                    .iter()
                    .any(|item| item["thumbnailOverlayTimeStatusRenderer"]["style"] == "SHORTS")
            })
        || title.split_whitespace().any(|word| {
            matches!(
                word.to_ascii_lowercase().as_str(),
                "#shorts" | "#youtubeshorts"
            )
        });
    if short {
        return None;
    }
    let upcoming = renderer.get("upcomingEventData").is_some();
    let scheduled_at = renderer["upcomingEventData"]["startTime"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .filter(|s| (1_000_000_000..=4_500_000_000).contains(s))
        .map(|s| s * 1000);
    let description = text(&renderer["detailedMetadataSnippets"][0]["snippetText"]);
    let duration = text(&renderer["lengthText"])
        .split(':')
        .try_fold(0_u32, |total, unit| {
            total.checked_mul(60)?.checked_add(unit.parse().ok()?)
        })
        .unwrap_or(0);
    Some(json!({
        "id": id, "title": title, "channelId": channel_id, "channel": channel,"creators":creators,
        "description": description, "duration": duration, "live": live, "upcoming":upcoming,"scheduledAt":scheduled_at,
        "publishedLabel": text(&renderer["publishedTimeText"]),
        "views":text(&renderer["viewCountText"]),
        "channelImage": avatar(&renderer["channelThumbnailSupportedRenderers"]["channelThumbnailWithLinkRenderer"]["thumbnail"]["thumbnails"][0]["url"]).unwrap_or_default(),
        "image": thumbnail(&renderer["thumbnail"]["thumbnails"],id),
        "date": "", "shorts": false, "paid": false, "embeddable": true,
    }))
}

#[tauri::command]
pub async fn watch_creator(state: State<'_, AppData>, id: String) -> Result<Value> {
    if !valid_id(&id, 11) {
        return Err("Invalid video ID.".into());
    }
    let url = Url::parse_with_params("https://www.youtube.com/watch", &[("v", id.as_str())])
        .map_err(|_| "Invalid video ID.")?;
    let data = embedded_json(
        &public_page(&state.client, url).await?,
        "var ytInitialPlayerResponse",
    )?;
    let details = &data["videoDetails"];
    if details["videoId"].as_str() != Some(id.as_str()) {
        return Err("The video’s public creator information is unavailable.".into());
    }
    let metadata = &data["microformat"]["playerMicroformatRenderer"];
    let channel = channel_key(&details["channelId"])
        .or_else(|| channel_key(&metadata["externalChannelId"]))
        .ok_or("YouTube didn’t return a public creator for this video.")?;
    Ok(
        json!({"id":channel,"name":details["author"].as_str().or_else(||metadata["ownerChannelName"].as_str()).unwrap_or("Creator"),
       "date":metadata["publishDate"].as_str().unwrap_or_default(),"title":details["title"].as_str().unwrap_or_default(),
       "live":is_live(&data),"embeddable":data["playabilityStatus"]["playableInEmbed"]!=false}),
    )
}

fn is_live(data: &Value) -> bool {
    data["videoDetails"]["isLive"] == true
        || data["microformat"]["playerMicroformatRenderer"]["liveBroadcastDetails"]["isLiveNow"]
            == true
}

#[tauri::command]
pub async fn channel_live(state: State<'_, AppData>, id: String) -> Result<Option<Value>> {
    if !id.starts_with("UC") || !valid_id(&id, 24) {
        return Err("Invalid channel.".into());
    }
    let url = Url::parse(&format!("https://www.youtube.com/channel/{id}/live"))
        .map_err(|_| "Invalid channel.")?;
    let html = public_page(&state.client, url).await?;
    let Ok(data) = embedded_json(&html, "var ytInitialPlayerResponse") else {
        return Ok(None);
    };
    let details = &data["videoDetails"];
    // /live can show an offline channel or its last broadcast. Only mark a
    // channel active when its own player metadata confirms a live broadcast.
    if details["channelId"] != id || !is_live(&data) {
        return Ok(None);
    }
    let video_id = details["videoId"]
        .as_str()
        .filter(|v| valid_id(v, 11))
        .ok_or("Unreadable live video.")?;
    let title = details["title"].as_str().ok_or("Unreadable live video.")?;
    let metadata = &data["microformat"]["playerMicroformatRenderer"];
    Ok(Some(
        json!({"id":video_id,"title":title,"channelId":id,"channel":details["author"].as_str().unwrap_or("Creator"),
        "image":format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"),
        "description":details["shortDescription"].as_str().unwrap_or_default(),
        "live":true,"duration":0,"shorts":false,"paid":false,
        "date":metadata["liveBroadcastDetails"]["startTimestamp"].as_str().unwrap_or_default(),
        "embeddable":data["playabilityStatus"]["playableInEmbed"]!=false}),
    ))
}

fn initial_data(html: &str) -> Result<Value> {
    embedded_json(html, "var ytInitialData")
}
fn embedded_json(html: &str, variable: &str) -> Result<Value> {
    html.match_indices(variable)
        .filter_map(|(index, name)| {
            let value = html[index + name.len()..]
                .trim_start()
                .strip_prefix('=')?
                .trim_start();
            serde_json::Deserializer::from_str(value)
                .into_iter::<Value>()
                .next()?
                .ok()
        })
        .next()
        .ok_or_else(|| "YouTube didn’t return readable results.".into())
}

fn search_sections(data: &Value) -> Result<&Vec<Value>> {
    data.pointer(
        "/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents",
    )
    .and_then(Value::as_array)
    .ok_or_else(|| "YouTube search results are temporarily unavailable.".into())
}

fn result_items(item: &Value, depth: u8) -> Vec<Value> {
    if depth == 0 {
        return vec![];
    }
    if let Some(v) = item
        .get("videoRenderer")
        .and_then(video)
        .or_else(|| item.get("lockupViewModel").and_then(lockup_video))
    {
        return vec![v];
    }
    if let Some(children) = item
        .pointer("/itemSectionRenderer/contents")
        .and_then(Value::as_array)
        .or_else(|| {
            item.pointer("/gridShelfViewModel/contents")
                .and_then(Value::as_array)
        })
    {
        return children
            .iter()
            .flat_map(|child| result_items(child, depth - 1))
            .collect();
    }
    if let Some(content) = item.pointer("/richItemRenderer/content") {
        return result_items(content, depth - 1);
    }
    if let Some(shelf) = item.get("shelfRenderer") {
        return [
            "horizontalListRenderer",
            "verticalListRenderer",
            "expandedShelfContentsRenderer",
        ]
        .iter()
        .filter_map(|name| shelf["content"][*name]["items"].as_array())
        .flatten()
        .flat_map(|child| result_items(child, depth - 1))
        .collect();
    }
    vec![]
}

fn search_items(sections: &[Value], filter: &str) -> Vec<Value> {
    let mut seen = HashSet::new();
    sections
        .iter()
        .flat_map(|section| result_items(section, 6))
        .filter(|item| {
            (match filter {
                "live" => item["live"] == true,
                "scheduled" => {
                    item["upcoming"] == true && item["live"] != true && item["scheduledAt"].is_u64()
                }
                _ => item["live"] != true && item["upcoming"] != true,
            }) && seen.insert(item["id"].as_str().unwrap_or_default().to_owned())
        })
        .collect()
}

#[tauri::command]
pub async fn live_status(state: State<'_, AppData>, id: String) -> Result<&'static str> {
    if !valid_id(&id, 11) {
        return Err("Invalid video ID.".into());
    }
    let url = Url::parse_with_params("https://www.youtube.com/watch", &[("v", id.as_str())])
        .map_err(|_| "Invalid video ID.")?;
    let html = public_page(&state.client, url).await?;
    let data = embedded_json(&html, "var ytInitialPlayerResponse")?;
    let status = &data["playabilityStatus"]["status"];
    let live = &data["microformat"]["playerMicroformatRenderer"]["liveBroadcastDetails"];
    Ok(
        if live["isLiveNow"] == true || data["videoDetails"]["isLive"] == true {
            "live"
        } else if live["endTimestamp"].is_string() {
            "ended"
        } else if status == "LIVE_STREAM_OFFLINE" || live["startTimestamp"].is_string() {
            "waiting"
        } else {
            "unknown"
        },
    )
}

fn client_version(html: &str) -> &str {
    html.split_once("\"INNERTUBE_CLIENT_VERSION\":\"")
        .and_then(|(_, tail)| tail.split_once('"'))
        .map(|(v, _)| v)
        .unwrap_or_default()
}

fn page(items: Vec<Value>, rows: &[Value], version: &str) -> Value {
    let next = rows.iter().rev().find_map(|row| {
        row.pointer("/continuationItemRenderer/continuationEndpoint/continuationCommand/token")
            .and_then(Value::as_str)
    });
    json!({"items":items,"next":next.filter(|_|!version.is_empty()).map(|token|json!({"token":token,"version":version}))})
}

async fn continue_rows(
    client: &reqwest::Client,
    kind: &str,
    cursor: &Value,
) -> Result<(Vec<Value>, String)> {
    let token = cursor["token"]
        .as_str()
        .filter(|s| !s.is_empty() && s.len() <= 16384 && s.is_ascii())
        .ok_or("Invalid result cursor.")?;
    let version = cursor["version"]
        .as_str()
        .filter(|s| {
            s.len() <= 32 && !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit() || b == b'.')
        })
        .ok_or("Invalid result cursor.")?;
    let url = match kind {
        "search" => "https://www.youtube.com/youtubei/v1/search",
        "browse" => "https://www.youtube.com/youtubei/v1/browse",
        _ => return Err("Unknown result page.".into()),
    };
    let response=client.post(url).header(reqwest::header::ORIGIN,"https://www.youtube.com")
        .json(&json!({"context":{"client":{"clientName":"WEB","clientVersion":version,"hl":"en"}},"continuation":token}));
    let body = read_page(response).await?;
    let data: Value =
        serde_json::from_str(&body).map_err(|_| "YouTube didn’t return readable results.")?;
    let rows = [
        "onResponseReceivedCommands",
        "onResponseReceivedActions",
        "onResponseReceivedEndpoints",
    ]
    .iter()
    .filter_map(|field| data[*field].as_array())
    .flatten()
    .flat_map(|action| {
        [
            "appendContinuationItemsAction",
            "reloadContinuationItemsCommand",
        ]
        .iter()
        .filter_map(move |kind| action[*kind]["continuationItems"].as_array())
    })
    .flatten()
    .cloned()
    .collect::<Vec<_>>();
    if rows.is_empty() && data.get("error").is_some() {
        return Err("YouTube couldn’t load the next page.".into());
    }
    Ok((rows, version.to_owned()))
}

#[tauri::command]
pub async fn search_youtube(
    state: State<'_, AppData>,
    query: String,
    filter: String,
    cursor: Option<Value>,
) -> Result<Value> {
    let url = search_url(&query, &filter)?;
    if let Some(cursor) = cursor {
        let (rows, version) = continue_rows(&state.client, "search", &cursor).await?;
        return Ok(page(search_items(&rows, &filter), &rows, &version));
    }
    let html = public_page(&state.client, url).await?;
    let data = initial_data(&html)?;
    let rows = search_sections(&data)?;
    Ok(page(
        search_items(rows, &filter),
        rows,
        client_version(&html),
    ))
}

#[tauri::command]
pub async fn channel_videos(
    state: State<'_, AppData>,
    id: String,
    tab: String,
    cursor: Option<Value>,
) -> Result<Value> {
    if !id.starts_with("UC") || !valid_id(&id, 24) || !matches!(tab.as_str(), "videos" | "streams")
    {
        return Err("Invalid channel or tab.".into());
    }
    if let Some(cursor) = cursor {
        let (rows, version) = continue_rows(&state.client, "browse", &cursor).await?;
        return Ok(page(channel_items(&rows, &id, ""), &rows, &version));
    }
    let url = Url::parse(&format!("https://www.youtube.com/channel/{id}/{tab}"))
        .map_err(|_| "Could not open the channel.")?;
    let html = public_page(&state.client, url).await?;
    let data = initial_data(&html)?;
    let tabs = data
        .pointer("/contents/twoColumnBrowseResultsRenderer/tabs")
        .and_then(Value::as_array)
        .ok_or("YouTube didn’t return a public channel.")?;
    let Some(selected) = tabs
        .iter()
        .map(|item| &item["tabRenderer"])
        .find(|t| t["selected"] == true)
    else {
        return Ok(page(vec![], &[], ""));
    };
    let endpoint = selected
        .pointer("/endpoint/commandMetadata/webCommandMetadata/url")
        .and_then(Value::as_str);
    if endpoint.is_some_and(|path| !path.ends_with(&format!("/{tab}"))) {
        return Ok(page(vec![], &[], ""));
    }
    let rows = selected["content"]["richGridRenderer"]["contents"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or_default();
    let photo = channel_photo(&data).unwrap_or_default();
    Ok(page(
        channel_items(rows, &id, &photo),
        rows,
        client_version(&html),
    ))
}

fn channel_photo(data: &Value) -> Option<String> {
    avatar(&data["metadata"]["channelMetadataRenderer"]["avatar"]["thumbnails"][0]["url"])
}

#[tauri::command]
pub async fn creator_photo(state: State<'_, AppData>, id: String) -> Result<Option<String>> {
    if !id.starts_with("UC") || !valid_id(&id, 24) {
        return Err("Invalid channel.".into());
    }
    let url = Url::parse(&format!("https://www.youtube.com/channel/{id}/videos"))
        .map_err(|_| "Invalid channel.")?;
    Ok(channel_photo(&initial_data(
        &public_page(&state.client, url).await?,
    )?))
}

#[tauri::command]
pub async fn youtube_suggestions(state: State<'_, AppData>, query: String) -> Result<Vec<String>> {
    let query = query.trim();
    if query.chars().count() < 2 || query.chars().count() > 160 {
        return Ok(vec![]);
    }
    let request = state
        .client
        .get("https://suggestqueries.google.com/complete/search")
        .query(&[("client", "firefox"), ("ds", "yt"), ("q", query)]);
    let raw = read_page(request).await?;
    let data: Value = serde_json::from_str(&raw).map_err(|_| "Suggestions are unavailable.")?;
    Ok(data[1]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|item| !item.is_empty() && item.chars().count() <= 160)
        .take(8)
        .map(str::to_owned)
        .collect())
}

fn channel_items(rows: &[Value], id: &str, photo: &str) -> Vec<Value> {
    let mut seen = HashSet::new();
    rows.iter()
        .filter_map(|row| channel_card(&row["richItemRenderer"]["content"], id, photo))
        .filter(|item| seen.insert(item["id"].as_str().unwrap_or_default().to_owned()))
        .collect()
}

fn channel_card(content: &Value, id: &str, photo: &str) -> Option<Value> {
    let mut item = if let Some(renderer) = content.get("videoRenderer") {
        video(renderer)?
    } else {
        lockup_video(&content["lockupViewModel"])?
    };
    if item["live"] == true || item["upcoming"] == true {
        return None;
    }
    if channel_key(&item["channelId"]).is_none() && !id.is_empty() {
        item["channelId"] = json!(id);
        if !photo.is_empty() {
            item["channelImage"] = json!(photo);
        }
    }
    Some(item)
}

#[tauri::command]
pub async fn channel_profile(state: State<'_, AppData>, id: String) -> Result<Value> {
    if !id.starts_with("UC") || !valid_id(&id, 24) {
        return Err("Invalid channel.".into());
    }
    let url = Url::parse(&format!("https://www.youtube.com/channel/{id}"))
        .map_err(|_| "Invalid channel.")?;
    let data = initial_data(&public_page(&state.client, url).await?)?;
    let meta = &data["metadata"]["channelMetadataRenderer"];
    if meta["externalId"]
        .as_str()
        .is_some_and(|actual| actual != id)
    {
        return Err("YouTube returned a different channel.".into());
    }
    let title = meta["title"]
        .as_str()
        .ok_or("This channel’s public profile is unavailable.")?;
    let photo = channel_photo(&data).unwrap_or_default();
    let header = &data["header"]["pageHeaderRenderer"]["content"]["pageHeaderViewModel"];
    let banner = header
        .pointer("/banner/imageBannerViewModel/image/sources")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .rev()
        .find_map(|item| avatar(&item["url"]))
        .unwrap_or_default();
    let details = header
        .pointer("/metadata/contentMetadataViewModel/metadataRows")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|row| row["metadataParts"].as_array())
        .flatten()
        .filter_map(|part| part["text"]["content"].as_str())
        .take(8)
        .collect::<Vec<_>>();
    let home = data
        .pointer("/contents/twoColumnBrowseResultsRenderer/tabs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|tab| tab["tabRenderer"]["selected"] == true)
        .map(|tab| &tab["tabRenderer"]["content"]);
    let mut seen = HashSet::new();
    let mut shelves = vec![];
    for item in home
        .and_then(|h| h.pointer("/sectionListRenderer/contents"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|row| row["itemSectionRenderer"]["contents"].as_array())
        .flatten()
    {
        if let Some(featured) = item.get("channelVideoPlayerRenderer") {
            if let Some(v) = video(featured) {
                if v["live"] != true
                    && v["upcoming"] != true
                    && seen.insert(v["id"].as_str().unwrap_or_default().to_owned())
                {
                    shelves.push(json!({"title":"Featured video","videos":[v]}));
                }
            }
        }
        if let Some(shelf) = item.get("shelfRenderer") {
            let heading = text(&shelf["title"]);
            let videos = [
                "horizontalListRenderer",
                "expandedShelfContentsRenderer",
                "verticalListRenderer",
            ]
            .iter()
            .find_map(|name| shelf["content"][*name]["items"].as_array())
            .into_iter()
            .flatten()
            .filter_map(|v| channel_card(v, "", ""))
            .filter_map(|v| {
                if !seen.insert(v["id"].as_str()?.to_owned()) {
                    return None;
                }
                Some(v)
            })
            .take(6)
            .collect::<Vec<_>>();
            if !videos.is_empty() && !heading.is_empty() {
                shelves.push(json!({"title":heading,"videos":videos}));
            }
        }
    }
    Ok(
        json!({"title":title,"description":meta["description"].as_str().unwrap_or_default(),"photo":photo,"banner":banner,"details":details,"shelves":shelves}),
    )
}

async fn public_page(client: &reqwest::Client, url: Url) -> Result<String> {
    read_page(client.get(url).header(reqwest::header::ACCEPT, "text/html")).await
}

async fn read_page(request: reqwest::RequestBuilder) -> Result<String> {
    let mut response = request
        .send()
        .await
        .map_err(|_| "Could not reach YouTube search. Check your connection and try again.")?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            429 => "YouTube is limiting searches right now. Try again in a few minutes.",
            _ => "YouTube search is temporarily unavailable.",
        }
        .into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Could not read YouTube’s search results.")?
    {
        if bytes.len() + chunk.len() > 5_242_880 {
            return Err("YouTube returned an unexpectedly large search page.".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    String::from_utf8(bytes).map_err(|_| "YouTube returned an unreadable page.".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modern_search_cards_keep_creator_links_photos_duration_and_dates() {
        let modern = json!({"lockupViewModel":{
            "contentId":"B6CG6-xIojQ","contentType":"LOCKUP_CONTENT_TYPE_VIDEO",
            "metadata":{"lockupMetadataViewModel":{
                "title":{"content":"An artist’s studio"},
                "image":{"avatarViewModel":{"image":{"sources":[{"url":"//yt3.ggpht.com/creator=s68"}]},"rendererContext":{"commandContext":{"onTap":{"innertubeCommand":{"browseEndpoint":{"browseId":"UCyBtl4KuX-5hGfQZZk-Ev6w"}}}}}}},
                "metadata":{"contentMetadataViewModel":{"metadataRows":[{"metadataParts":[{"text":{"content":"Studio Creator"}},{"text":{"content":"2d ago"}}]}]}}
            }},
            "contentImage":{"thumbnailViewModel":{"overlays":[{"thumbnailBottomOverlayViewModel":{"badges":[{"thumbnailBadgeViewModel":{"text":"5:39","badgeStyle":"THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT"}}]}}]}}
        }});
        let rows = vec![json!({"itemSectionRenderer":{"contents":[
            {"adSlotRenderer":{"content":modern.clone()}},
            {"shelfRenderer":{"content":{"horizontalListRenderer":{"items":[modern.clone()]}}}},
            modern.clone()
        ]}})];
        let result = search_items(&rows, "all");
        assert_eq!(result.len(), 1);
        assert_eq!(result[0]["channelId"], "UCyBtl4KuX-5hGfQZZk-Ev6w");
        assert_eq!(result[0]["channel"], "Studio Creator");
        assert_eq!(result[0]["publishedLabel"], "2d ago");
        assert_eq!(result[0]["duration"], 339);
        assert_eq!(search_items(&[modern], "all").len(), 1);
        assert_eq!(
            result[0]["channelImage"],
            "https://yt3.ggpht.com/creator=s68"
        );
    }

    #[test]
    fn search_text_stays_on_the_public_results_endpoint() {
        let url = search_url(" cats & next=1 ", "all").unwrap();
        assert_eq!(url.host_str(), Some("www.youtube.com"));
        assert_eq!(url.path(), "/results");
        assert_eq!(
            url.query_pairs().collect::<Vec<_>>(),
            vec![("search_query".into(), "cats & next=1".into())]
        );
        assert!(search_url(" ", "all").is_err());
        assert!(search_url("test", "unsupported").is_err());
        assert_eq!(
            search_url("lofi", "live")
                .unwrap()
                .query_pairs()
                .last()
                .unwrap()
                .1,
            "EgJAAQ=="
        );
    }

    #[test]
    fn renders_unique_public_videos_and_can_limit_to_live() {
        let item = json!({"videoRenderer":{"videoId":"jNQXAC9IVRw","title":{"runs":[{"text":"Me at the zoo } ;"}]},"lengthText":{"simpleText":"1:12"}}});
        let live = json!({"videoRenderer":{"videoId":"12345678901","title":{"simpleText":"Live now"},"thumbnailOverlays":[{"thumbnailOverlayTimeStatusRenderer":{"style":"LIVE"}}]}});
        let ad = json!({"adSlotRenderer":item.clone()});
        let shelf = json!({"gridShelfViewModel":{"contents":[{"shortsLockupViewModel":{
            "overlayMetadata":{"primaryText":{"content":"A Short"}},
            "onTap":{"innertubeCommand":{"reelWatchEndpoint":{"videoId":"ABCDEFGHIJK"}}}
        }}]}});
        let data = json!({"contents":{"twoColumnSearchResultsRenderer":{"primaryContents":{"sectionListRenderer":{"contents":[{"itemSectionRenderer":{"contents":[ad,item,item,live,shelf]}}]}}}}});
        let html = format!("<script>var ytInitialData = {data};</script>");
        let data = initial_data(&html).unwrap();
        let rows = search_sections(&data).unwrap();
        let videos = search_items(rows, "all");
        assert_eq!(videos.len(), 1);
        assert_eq!(videos[0]["title"], "Me at the zoo } ;");
        assert_eq!(videos[0]["duration"], 72);
        assert_eq!(search_items(rows, "live")[0]["id"], "12345678901");
        assert!(initial_data("<script>no data</script>").is_err());
    }
}
