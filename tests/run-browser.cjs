/* Requires the README local server and an installed Chrome; no packages or real profile. */
const { spawn } = require('node:child_process');
const { mkdtemp, readFile, rm, mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const chromePath = process.argv[2] || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const origin = 'http://127.0.0.1:4173';

(async () => {
  const profile = await mkdtemp(join(tmpdir(), 'arclike-check-'));
  let socket;
  const chrome = spawn(chromePath, ['--headless', '--disable-gpu', '--disable-background-networking', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
  let launchError;
  chrome.on('error', error => { launchError = error; });
  try {
    let port;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (launchError) throw launchError;
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(100); }
    }
    assert(port, 'Chrome did not expose a debugging port');
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const tab = tabs.find(item => item.type === 'page');
    socket = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    const requests = [];
    let dragData;
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
      if (message.method === 'Input.dragIntercepted') dragData = message.params.data;
      if (!message.id || !pending.has(message.id)) return;
      const { resolve, reject, timer } = pending.get(message.id);
      clearTimeout(timer); pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message)); else resolve(message.result);
    });
    const call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => {
      const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await delay(50); }
      throw new Error(`Browser condition timed out: ${expression}`);
    };
    const pointerClick = async selector => {
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    };
    await call('Page.enable'); await call('Network.enable'); await call('Page.bringToFront');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1060, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `${origin}/tests/browser.html` });
    await waitFor('document.querySelector("#status")?.textContent.includes("项通过")');
    const result = await evaluate('document.querySelector("iframe").contentWindow.arcLikeTestResult');
    console.log(`DOM interactions: ${result.passed}/${result.total}`);
    for (const item of result.results) if (!item.pass) console.log(`FAIL ${item.name}: ${item.error}`);
    assert.equal(result.passed, result.total, 'DOM interaction checks failed');

    await call('Page.navigate', { url: origin });
    await waitFor('document.readyState === "complete" && typeof state !== "undefined" && document.querySelector(".hero-link")');
    await pointerClick('.hero-link');
    assert(await evaluate('state.live.notebook.url !== M.getEntity(state,"notebook").homeUrl'), 'Pointer navigation failed');
    await pointerClick('.home-strip button');
    assert(await evaluate('state.live.notebook.url === M.getEntity(state,"notebook").homeUrl'), 'Pointer return-home failed');
    await pointerClick('[data-action="close"][data-id="notebook"]');
    assert(await evaluate('!state.live.notebook && !!document.querySelector("#pins [data-row=notebook]")'), 'Pointer close removed entry');
    await pointerClick('[data-action="open"][data-id="notebook"]');
    assert(await evaluate('!!state.live.notebook'), 'Pointer reopen failed');
    await evaluate('document.querySelector("#quick-open").focus()');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert(await evaluate('document.activeElement.matches(":focus-visible") && getComputedStyle(document.activeElement).outlineStyle !== "none"'), 'Trusted keyboard focus ring failed');
    console.log('Native pointer navigation / home / close / reopen and keyboard focus: PASS');

    await mkdir(join(__dirname, '..', 'docs', 'preview'), { recursive: true });
    await evaluate('document.activeElement.blur(); document.querySelector(".sidebar-scroll").scrollTop=0; clearTimeout(toastTimer); document.querySelector("#toast").classList.remove("visible")');
    const screenshot = async name => {
      await delay(150);
      const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(join(__dirname, '..', 'docs', 'preview', name), Buffer.from(image.data, 'base64'));
    };
    await screenshot('desktop.png');
    for (const width of [280, 320, 360]) {
      await call('Emulation.setDeviceMetricsOverride', { width, height: 720, deviceScaleFactor: 1, mobile: false });
      await delay(50);
      const geometry = await evaluate('(()=>{const b=document.querySelector(".sidebar-bottom").getBoundingClientRect();return {width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,dock:b.bottom,viewport:innerHeight}})()');
      assert.equal(geometry.width, width, 'Narrow view horizontal overflow');
      assert.equal(geometry.height, 720, 'Narrow view does not fill Side Panel');
      assert(geometry.dock <= geometry.viewport, 'Workspace dock clipped');
      if (width === 320) await screenshot('side-panel.png');
    }
    await call('Emulation.setDeviceMetricsOverride', { width: 320, height: 720, deviceScaleFactor: 1, mobile: false });
    await evaluate('dispatch({type:"theme",value:"dark"})');
    await screenshot('dark-panel.png');
    console.log('280 / 320 / 360px × 720px layout: PASS; screenshots saved to docs/preview/');
    await evaluate('dispatch({type:"rename",id:"design",title:"B".repeat(60)})');
    assert(await evaluate('document.documentElement.scrollWidth===320'), 'Long folder name overflow');
    await evaluate('for(let i=0;i<8;i++)dispatch({type:"add-space",id:`overflow-${i}`,title:"A".repeat(60)})');
    assert(await evaluate('document.documentElement.scrollWidth===320 && document.querySelector("#spaces").scrollLeft>0'), 'Many workspaces / long names overflow');
    console.log('Many workspaces and 60-character names: PASS');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1060, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: `${origin}/tests/extension-browser.html` });
    await waitFor('!!window.arcLikeExtensionTestResult');
    const extensionResult = await evaluate('window.arcLikeExtensionTestResult');
    console.log(`Extension DOM interactions (mock Chrome APIs): ${extensionResult.passed}/${extensionResult.total}`);
    for (const item of extensionResult.results) if (!item.pass) console.log(`FAIL ${item.name}: ${item.error}`);
    assert.equal(extensionResult.passed, extensionResult.total, 'Extension DOM checks failed');
    const panelClick = async selector => {
      const point = await evaluate(`(()=>{const f=document.querySelector('#panel-frame'),e=f.contentDocument.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),b=f.getBoundingClientRect();return {x:b.x+1+r.x+r.width/2,y:b.y+1+r.y+r.height/2}})()`);
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    };
    const initialCreates = await evaluate('window.arcLikeExtensionFake.records.filter(r=>r[0]==="tabs.create").length');
    await panelClick('#pins [data-action="close"]');
    await waitFor('!!document.querySelector("#panel-frame").contentDocument.querySelector("#pins .unloaded")');
    await panelClick('#pins [data-action="open"]');
    await waitFor('!!document.querySelector("#panel-frame").contentDocument.querySelector("#pins .active")');
    assert.equal(await evaluate('window.arcLikeExtensionFake.records.filter(r=>r[0]==="tabs.create").length'), initialCreates + 1, 'Extension native pointer did not create exactly one mock tab');
    await evaluate('document.querySelector("#panel-frame").contentDocument.querySelector("#quick-open").focus()');
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert(await evaluate('(()=>{const e=document.querySelector("#panel-frame").contentDocument.activeElement;return e.matches(":focus-visible")&&getComputedStyle(e).outlineStyle!=="none"})()'), 'Extension trusted keyboard focus failed');
    console.log('Extension native pointer close / reopen and trusted Tab (mock Chrome APIs): PASS');
    const draggedPage = await evaluate(`(async()=>{const f=window.arcLikeExtensionFake,w=document.querySelector('#panel-frame').contentWindow;w.document.addEventListener('drop',event=>{w.arcLikeTrustedDrop=event.isTrusted});const r=await f.api.runtime.sendMessage({scope:'arclike:command',windowId:1,action:{type:'add',kind:'today',title:'原生拖动检查',url:'https://example.org/drag'}});const id=w.ArcModel.currentSpace(r.state).today.at(-1).id;return {id,tabId:r.state.live[id].tabId}})()`);
    const dragPoint = selector => evaluate(`(()=>{const f=document.querySelector('#panel-frame'),r=f.getBoundingClientRect(),e=f.contentDocument.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const p=e.getBoundingClientRect();return {x:r.x+1+p.x+p.width/2,y:r.y+1+p.y+p.height/2}})()`);
    await call('Input.setInterceptDrags', { enabled: true });
    for (const [kind, target] of [['pin', '#pins-label'], ['favorite', '#favorites-label']]) {
      let page = draggedPage;
      if (kind === 'favorite') page = await evaluate(`(async()=>{const f=window.arcLikeExtensionFake,w=document.querySelector('#panel-frame').contentWindow;const r=await f.api.runtime.sendMessage({scope:'arclike:command',windowId:1,action:{type:'add',kind:'today',title:'常用拖动检查',url:'https://example.org/favorite'}});const id=w.ArcModel.currentSpace(r.state).today.at(-1).id;return {id,tabId:r.state.live[id].tabId}})()`);
      const source = await dragPoint(`#today [data-action="open"][data-id="${page.id}"]`), destination = await dragPoint(target);
      dragData = null;
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...source });
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', buttons: 1, clickCount: 1, ...source });
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: source.x + 8, y: source.y });
      for (let attempt = 0; !dragData && attempt < 100; attempt++) await delay(20);
      assert(dragData, 'Native mouse gesture did not start HTML drag');
      for (const type of ['dragEnter', 'dragOver', 'drop']) await call('Input.dispatchDragEvent', { type, ...destination, data: dragData });
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...destination });
      await waitFor(`(()=>{const d=document.querySelector('#panel-frame').contentDocument;return !!d.querySelector(${JSON.stringify(`${kind === 'pin' ? '#pins [data-row' : '#favorites [data-id'}="${page.id}"]`)})})()`);
      assert(await evaluate(`document.querySelector('#panel-frame').contentWindow.arcLikeTrustedDrop && window.arcLikeExtensionFake.tabs.has(${page.tabId}) && window.arcLikeExtensionFake.session['arclike.session.v1'].state.live[${JSON.stringify(page.id)}].tabId===${page.tabId}`), 'Trusted drop lost or recreated the page');
    }
    await call('Input.setInterceptDrags', { enabled: false });
    console.log('Trusted Chrome HTML drag Today → Pinned / Favorites (mock tab APIs): PASS');
    await evaluate('(()=>{const d=document.querySelector("#panel-frame").contentDocument;d.activeElement.blur();d.querySelector("#toast").hidden=true})()');
    const setTheme = value => evaluate(`window.arcLikeExtensionFake.api.runtime.sendMessage({scope:'arclike:command',windowId:1,action:{type:'theme',value:${JSON.stringify(value)}}})`);
    await setTheme('auto');
    await evaluate('(()=>{const w=document.querySelector("#panel-frame").contentWindow,d=w.document;d.querySelector("#settings").click();w.themeDraft=d.querySelector("[name=expiryHours]");w.themeDraft.value="47";w.themeDraft.focus()})()');
    for (const scheme of ['dark', 'light']) {
      await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
      await waitFor(`document.querySelector('#panel-frame').contentDocument.body.classList.contains('dark')===${scheme === 'dark'}`);
      assert(await evaluate('window.arcLikeExtensionFake.local["arclike.data.v1"].theme==="auto"'), 'Automatic scheme rewrote the saved preference');
    }
    assert(await evaluate('(()=>{const w=document.querySelector("#panel-frame").contentWindow;return w.document.querySelector("#dialog").open && w.themeDraft.value==="47" && w.document.activeElement===w.themeDraft})()'), 'Automatic appearance lost the focused unsaved input');
    await evaluate('(()=>{const d=document.querySelector("#panel-frame").contentDocument;d.querySelector("#dialog-close").click()})()');
    await delay(20);
    await setTheme('ocean');
    await evaluate('document.querySelector("#panel-frame").contentDocument.activeElement.blur()');
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    assert(await evaluate('!document.querySelector("#panel-frame").contentDocument.body.classList.contains("dark")'), 'Explicit theme followed automatic scheme');
    await call('Emulation.setEmulatedMedia', { features: [] });
    console.log('Browser-emulated light / dark preference changes; automatic follows, explicit palette stays: PASS');
    const bounds = await evaluate('(()=>{const b=document.querySelector("#panel-frame").getBoundingClientRect();return {x:b.x+1,y:b.y+1,width:320,height:720,scale:1}})()');
    const extensionImage = await call('Page.captureScreenshot', { format: 'png', clip: bounds });
    await writeFile(join(__dirname, '..', 'docs', 'preview', 'extension-panel.png'), Buffer.from(extensionImage.data, 'base64'));
    const backgrounds = new Set();
    for (const theme of ['sand', 'ocean', 'lavender']) {
      await setTheme(theme);
      backgrounds.add(await evaluate('getComputedStyle(document.querySelector("#panel-frame").contentDocument.querySelector("#sidebar")).backgroundImage'));
      const image = await call('Page.captureScreenshot', { format: 'png', clip: bounds });
      await writeFile(join(__dirname, '..', 'docs', 'preview', `theme-${theme}.png`), Buffer.from(image.data, 'base64'));
    }
    assert.equal(backgrounds.size, 3, 'Themes rendered the same sidebar palette');
    await setTheme('sand');
    await evaluate('document.querySelector("#panel-frame").contentDocument.addEventListener("contextmenu",e=>{window.arcLikeTrustedContext=e.isTrusted})');
    const favoritePoint = await dragPoint('#favorites [data-id]');
    for (const type of ['mousePressed', 'mouseReleased']) await call('Input.dispatchMouseEvent', { type, button: 'right', clickCount: 1, ...favoritePoint });
    await waitFor('window.arcLikeTrustedContext && !!document.querySelector("#panel-frame").contentDocument.querySelector("[data-menu=icon]")');
    await panelClick('[data-menu="icon"]');
    await waitFor('!!document.querySelector("#panel-frame").contentDocument.querySelector("#icon-fields")');
    await evaluate('(()=>{const w=document.querySelector("#panel-frame").contentWindow,d=w.document;for(const [id,value] of [["icon-choice","code"],["icon-color","blue"]]){const e=d.getElementById(id);e.value=value;e.dispatchEvent(new w.Event("input",{bubbles:true}))}})()');
    const iconImage = await call('Page.captureScreenshot', { format: 'png', clip: bounds });
    await writeFile(join(__dirname, '..', 'docs', 'preview', 'icon-editor.png'), Buffer.from(iconImage.data, 'base64'));
    const beforeIconCreates = await evaluate('window.arcLikeExtensionFake.records.filter(r=>r[0]==="tabs.create").length');
    await panelClick('#dialog-actions [type="submit"]');
    await waitFor('!document.querySelector("#panel-frame").contentDocument.querySelector("#dialog").open && window.arcLikeExtensionFake.local["arclike.data.v1"].favorites[0].icon==="code"');
    assert.equal(await evaluate('window.arcLikeExtensionFake.records.filter(r=>r[0]==="tabs.create").length'), beforeIconCreates, 'Native icon editing opened a tab');
    console.log('Trusted Favorite right-click / icon dialog / native save (mock tab APIs): PASS');
    await setTheme('auto');
    await evaluate(`(async()=>{
      const frame=document.querySelector('#panel-frame'), fake=window.arcLikeExtensionFake;
      const send=action=>fake.api.runtime.sendMessage({scope:'arclike:command',windowId:1,action});
      const {state}=await send({type:'connect'});
      for(const id of Object.keys(state.live)) await send({type:'close',id});
      for(const item of [...state.favorites,...state.spaces.flatMap(space=>space.pins)]) await send({type:'remove',id:item.id});
      frame.style.width='360px';
    })()`);
    const emptyBounds = await evaluate('(()=>{const b=document.querySelector("#panel-frame").getBoundingClientRect();return {x:b.x+1,y:b.y+1,width:360,height:720,scale:1}})()');
    const emptyImage = await call('Page.captureScreenshot', { format: 'png', clip: emptyBounds });
    await writeFile(join(__dirname, '..', 'docs', 'preview', 'extension-empty.png'), Buffer.from(emptyImage.data, 'base64'));
    await call('Page.navigate', { url: pathToFileURL(join(__dirname, '..', 'index.html')).href });
    await waitFor('document.readyState === "complete" && typeof state !== "undefined" && document.querySelector(".hero-link")');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1060, deviceScaleFactor: 1, mobile: false });
    await pointerClick('.hero-link');
    assert(await evaluate('state.live.notebook.url !== M.getEntity(state,"notebook").homeUrl'), 'Direct-file interaction failed');
    console.log('Direct file:// open and interaction: PASS');
    await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    const storeAssets = join(__dirname, '..', 'store', 'assets');
    await mkdir(storeAssets, { recursive: true });
    await call('Page.navigate', { url: `${origin}/store/preview.html` });
    await waitFor('document.readyState === "complete"');
    const storeIcon = await evaluate(`(async()=>{
      const image=new Image();image.src='./../extension/icons/mark.svg';await image.decode();
      const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
      const context=canvas.getContext('2d');context.drawImage(image,16,16,96,96);
      for(const [x,y] of [[0,0],[15,15],[112,112],[127,127]]) if(context.getImageData(x,y,1,1).data[3]!==0) throw new Error('Store icon padding');
      return canvas.toDataURL('image/png').split(',')[1];
    })()`);
    await writeFile(join(__dirname, '..', 'extension', 'icons', '128.png'), Buffer.from(storeIcon, 'base64'));
    await call('Network.setCacheDisabled', { cacheDisabled: true });
    for (const view of ['overview', 'icons']) {
      await call('Page.navigate', { url: `${origin}/store/preview.html#${view}` });
      await waitFor('document.readyState === "complete" && [...document.images].every(i=>i.complete && i.naturalWidth>0)');
      assert.equal(await evaluate('document.documentElement.scrollWidth'), 1280, 'Store image overflow');
      assert.equal(await evaluate('document.documentElement.scrollHeight'), 800, 'Store image height');
      const image = await call('Page.captureScreenshot', { format: 'jpeg', quality: 95, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 1 } });
      await writeFile(join(storeAssets, `${view}.jpg`), Buffer.from(image.data, 'base64'));
    }
    console.log('Store draft images: 2 × 1280 × 800 JPEG, example data only: PASS');
    assert(requests.every(url => url.startsWith(`${origin}/`) || url.startsWith('file://') || url.startsWith('data:')), 'Unexpected external page resource request');
    console.log('No external page resource requests: PASS');
  } finally {
    socket?.close(); chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(2000)]);
    if (chrome.exitCode === null && chrome.signalCode === null) chrome.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
