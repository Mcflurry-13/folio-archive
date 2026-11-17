if (['http://127.0.0.1:5180','http://localhost:5180'].includes(location.origin)) {
  window.addEventListener('message', async event => {
    if(event.source!==window || event.origin!==location.origin || event.data?.channel!=='folio-request')return;
    const {id,action,url}=event.data;
    if(typeof id==='string'&&['xhs.sync.session','xhs.sync.collections','xhs.sync.preview','xhs.sync.read','xhs.sync.control'].includes(action)){
      try{const result=await chrome.runtime.sendMessage(event.data);window.postMessage({channel:'folio-response',id,...result},location.origin);}catch{window.postMessage({channel:'folio-response',id,ok:false,error:{code:'CONNECTION'}},location.origin);}return;
    }
    if(typeof id!=='string'||!['ping','capture'].includes(action))return;
    try {
      const result=action==='ping'?{connected:true}:await chrome.runtime.sendMessage({action,url});
      window.postMessage({channel:'folio-response',id,...result},location.origin);
    }catch{window.postMessage({channel:'folio-response',id,error:'CONNECTION'},location.origin);}
  });
}
