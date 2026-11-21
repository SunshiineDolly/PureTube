(() => {
  // Only the standalone test executable loads this script. No user account or library.
  if (window !== window.top) {
    addEventListener('securitypolicyviolation',e=>top.postMessage({type:'viddy-native-error',error:'CSP '+e.violatedDirective+' '+e.blockedURI},'*'));
    addEventListener('error',e=>top.postMessage({type:'viddy-native-error',error:e.message},'*'));
    if (location.hostname === '127.0.0.1') setInterval(() => {
      const player = window.viddyPreviewPlayer;
      if (player?.getCurrentTime) parent.postMessage({type:'viddy-native-time',time:player.getCurrentTime()}, '*');
    }, 500);
    return;
  }
  const native = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  const report={engine:'native macOS WKWebView',videoTimeAdvanced:false,platform:navigator.platform,hover:matchMedia('(hover:hover)').matches,reducedMotion:matchMedia('(prefers-reduced-motion:reduce)').matches,states:[],errors:[]};
  let first,done=false;
  function finish(){if(done)return;done=true;report.frames=[...document.querySelectorAll('.thumbnail-preview iframe')].map(f=>f.src);native('preview_check_result',{report});}
  addEventListener('error',e=>report.errors.push(e.message));
  addEventListener('securitypolicyviolation',e=>report.errors.push('CSP '+e.violatedDirective+' '+e.blockedURI));
  addEventListener('message',e=>{
    if(e.data?.type==='viddy-video-preview')report.states.push({state:e.data.state,code:e.data.code});
    if(e.data?.type==='viddy-native-error')report.errors.push(e.data.error);
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
