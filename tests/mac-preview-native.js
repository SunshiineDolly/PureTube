(() => {
  // Only the standalone test executable loads this script. No user account or library.
  if (window !== window.top) {
    if (location.hostname === '127.0.0.1') setInterval(() => {
      const player = window.viddyPreviewPlayer;
      if (player?.getCurrentTime) parent.postMessage({type:'viddy-native-time',time:player.getCurrentTime()}, '*');
    }, 500);
    return;
  }
  const native = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  const data={version:1,settings:{intro:false,tray:false,themedCursor:false}};
  const sample={id:'jNQXAC9IVRw',title:'Native Mac preview check',description:'Public video',metadataComplete:true,channelId:'UC0000000000000000000002',channel:'Example creator',image:'',date:'2026-11-21',duration:120,shorts:false,paid:false,embeddable:true};
  window.__TAURI_INTERNALS__.invoke=async(cmd,args={})=>{
    if(cmd==='youtube_embed_port'||cmd==='preview_check_result')return native(cmd,args);
    if(cmd==='load')return data;
    if(cmd==='plugin:app|version')return 'native-test';
    if(cmd==='plugin:event|listen')return 1;
    if(cmd==='public_feed')return '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"/>';
    if(cmd==='search_youtube'||cmd==='channel_videos')return {items:[sample],next:null};
    if(cmd==='scheduled_channel')return [];
    if(cmd==='account_configured'||cmd==='update_configured'||cmd==='plugin:window|is_maximized')return false;
    return null;
  };
  const report={engine:'native macOS WKWebView',videoTimeAdvanced:false,platform:navigator.platform,hover:matchMedia('(hover:hover)').matches,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,states:[],errors:[]};
  let first,done=false;
  function finish(){if(done)return;done=true;report.frames=[...document.querySelectorAll('.thumbnail-preview iframe')].map(f=>f.src);native('preview_check_result',{report});}
  addEventListener('error',e=>report.errors.push(e.message));
  addEventListener('securitypolicyviolation',e=>report.errors.push('CSP '+e.violatedDirective+' '+e.blockedURI));
  addEventListener('message',e=>{
    if(e.data?.type==='viddy-video-preview')report.states.push(e.data.state);
    if(e.data?.type==='viddy-native-time'){
      if(first===undefined)first=e.data.time;
      if(e.data.time>first+1){report.videoTimeAdvanced=true;finish();}
    }
  });
  const interval=setInterval(()=>{
    const card=document.querySelector('.content > div:not([hidden]) .card .thumbnail');
    if(card){clearInterval(interval);card.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,relatedTarget:null}));}
  },200);
  setTimeout(finish,65000);
})();
