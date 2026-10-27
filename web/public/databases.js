/* Connection management is a web extension. Agent calls use the native MCP client. */
const databaseEngines={mysql:{name:'MySQL',port:3306,mark:'My',hint:'数据库名称，例如 sakila'},postgresql:{name:'PostgreSQL',port:5432,mark:'Pg',hint:'数据库名称'},clickhouse:{name:'ClickHouse',port:8123,mark:'Ch',hint:'数据库名称，使用 HTTP 端口'},elasticsearch:{name:'Elasticsearch',port:9200,mark:'Es',hint:'索引名称或模式，例如 sales-*'}};
async function databaseApi(action='',payload){const response=await fetch('/api/databases'+(action?'/'+action:''),payload?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}:{});let data;try{data=await response.json();}catch{throw new Error('数据库接口尚未就绪，请检查网页服务。');}if(!response.ok)throw new Error(data.error||'数据库请求失败');return data;}
async function ensureDatabaseMcp(status){const before=await rpc('config/read',{includeLayers:true,cwd:state.selectedCwd});const existing=before.config?.mcp_servers?.[status.mcpName];if(existing&&(existing.command!==status.mcpConfig.command||pretty(existing.args)!==pretty(status.mcpConfig.args)))throw new Error('同名 MCP 已被其他服务占用，请先在 MCP 页面调整名称。');if(existing?.enabled!==false&&existing?.command===status.mcpConfig.command&&existing?.env?.CODEX_WEB_DB_STATE===status.mcpConfig.env.CODEX_WEB_DB_STATE)return;await writeMcpConfig(status.mcpName,status.mcpConfig,before);}
function databaseConnectionState(connection){return !connection.enabled?'已停用':{connected:'已连接',failed:'连接失败',unverified:'待验证'}[connection.status]||'待验证';}
function databaseCardHeading(connection){
  const engine=databaseEngines[connection.engine]||{name:connection.engine,mark:'DB'},heading=el('div','db-card-heading'),titles=el('div');
  titles.append(el('h2','',connection.name),el('span','subtle',engine.name));heading.append(el('span','db-logo db-'+connection.engine,engine.mark),titles,el('span','db-state '+(!connection.enabled?'disabled':connection.status),databaseConnectionState(connection)));return heading;
}
async function renderDatabases(){
  const root=panelHeading('数据源','配置和管理数据库连接，查看表结构。Agent 会发现已启用、可用且获授权的数据源。','database');
  const intro=el('div','db-intro');intro.append(el('span','db-shield','✓ 永久只读'),el('p','','无需手动选择数据源。Agent 按问题使用可用连接；实际访问范围由数据库只读账号和服务端约束。'));root.append(intro);
  const connections=el('div');connections.id='database-connections';root.append(connections);await renderDatabaseSettings(connections);
}
function showDatabaseSettings(){showView('databases');}
const databaseSettingsRenders=new WeakMap();
async function renderDatabaseSettings(root){
  if(root.id==='analysis-advanced-databases'){
    root.replaceChildren(el('h3','','数据库连接'),el('p','subtle','数据源可由用户直接配置、管理和启停。'),button('管理数据源',showDatabaseSettings));return;
  }
  const generation=(databaseSettingsRenders.get(root)||0)+1;databaseSettingsRenders.set(root,generation);root.replaceChildren(el('h3','','数据库连接管理'));
  const toolbar=el('div','db-toolbar'),status=el('p','subtle','正在读取连接配置…'),grid=el('div','db-grid');toolbar.append(button('＋ 添加数据库',()=>editDatabase(null,()=>renderDatabaseSettings(root)),'solid-button'),button('刷新连接配置',()=>renderDatabaseSettings(root)),button('全部查询快照',showDatabaseResults));root.append(toolbar,status,grid);
  let data;try{data=await databaseApi();}catch(error){if(root.isConnected===false||databaseSettingsRenders.get(root)!==generation)return;status.textContent='连接配置读取失败：'+nativeErrorMessage(error);status.setAttribute('role','alert');grid.append(button('重试读取连接配置',()=>renderDatabaseSettings(root)));return;}
  if(root.isConnected===false||databaseSettingsRenders.get(root)!==generation)return;
  if(!data.ready){status.textContent='数据库组件尚未安装，请先完成服务端数据库驱动安装。';return;}
  status.textContent=data.connections.length?data.connections.length+' 个连接 · 密码保存在服务器，不会提供给 Agent':'还没有连接，添加并验证一个只读数据源。';
  const managedButton=(label,action)=>{const control=button(label,async()=>{control.disabled=true;control.textContent='处理中…';try{await action();}catch(error){status.textContent='操作失败：'+nativeErrorMessage(error);status.setAttribute('role','alert');throw error;}finally{if(control.isConnected){control.disabled=false;control.textContent=label;}}});return control;};
  for(const connection of data.connections){
    const card=el('article','db-card');card.dataset.managedConnectionId=connection.id;card.dataset.connectionId=connection.id;card.append(databaseCardHeading(connection),el('p','db-address',connection.host+':'+connection.port+' / '+connection.database),el('p','subtle','账号 '+connection.username+' · 永久只读'));
    if(connection.error)card.append(el('p','db-error',connection.error));if(connection.checkedAt)card.append(el('small','subtle','最近测试 '+new Date(connection.checkedAt).toLocaleString()));
    const actions=el('div','db-card-actions');actions.append(managedButton('测试连接',async()=>{const result=await databaseApi('test',{id:connection.id});if(result.success&&connection.enabled)await ensureDatabaseMcp(data);toast(result.success?'只读连接已验证':'连接验证失败：'+result.connection.error);await renderDatabaseSettings(root);}),button('查看表结构',()=>showDatabaseSchema(connection)),button('编辑',()=>editDatabase(connection,()=>renderDatabaseSettings(root))),managedButton(connection.enabled?'停用':'启用',async()=>{const result=await databaseApi('toggle',{id:connection.id,enabled:!connection.enabled});if(result.success&&!connection.enabled)await ensureDatabaseMcp(data);await renderDatabaseSettings(root);toast(connection.enabled?'数据源已停用':result.success?'数据源已启用并通过连接验证':'数据源已启用，连接验证失败：'+result.connection.error);}),button('移除',()=>openDialog('移除数据库连接',body=>body.append(el('p','','将移除“'+connection.name+'”的连接配置，数据库中的数据不会改变。')),async()=>{await databaseApi('remove',{id:connection.id});await renderDatabaseSettings(root);toast('数据库连接已移除');},'移除连接')));card.append(actions);grid.append(card);
  }
  if(!data.connections.length)grid.append(el('p','subtle','暂无数据库连接。'));
}

function editDatabase(connection,refresh=()=>showDatabaseSettings()){const current=connection||{engine:'mysql',port:3306,host:'127.0.0.1',enabled:true,verifyTls:true};openDialog(connection?'编辑数据库':'添加数据库',body=>{const form=el('div','db-form');body.append(el('p','db-readonly-note','仅接受专用只读账号。禁止写入，无需也不能授权写入。'),form);function field(name,label,type='text',value='',required=true){const group=el('label','db-field');group.append(el('span','',label));const input=el(type==='select'?'select':'input','field-input');input.name=name;input.id='db-'+name;input.ariaLabel=label;if(type!=='select')input.type=type;input.value=value;input.required=required;group.append(input);form.append(group);return input;}
 const name=field('name','连接名称','text',current.name||''),engine=field('engine','数据库类型','select');for(const [key,info]of Object.entries(databaseEngines)){const option=el('option','',info.name);option.value=key;engine.append(option);}engine.value=current.engine;const host=field('host','主机','text',current.host),port=field('port','端口','number',current.port),database=field('database','数据库 / 索引','text',current.database||''),schema=field('schema','Schema','text',current.schema||'public',false),username=field('username','只读用户名','text',current.username||''),password=field('password','密码','password','',!connection);password.autocomplete='new-password';password.placeholder=connection?'留空保留现有密码':'';
 const security=el('div','db-tls'),tls=el('input');tls.type='checkbox';tls.id='db-tls';tls.checked=!!current.tls;const tlsLabel=el('label');tlsLabel.append(tls,document.createTextNode(' 使用 TLS 加密连接'));security.append(tlsLabel);const verify=el('input');verify.type='checkbox';verify.id='db-verify';verify.checked=current.verifyTls!==false;const verifyLabel=el('label');verifyLabel.append(verify,document.createTextNode(' 验证服务器证书'));security.append(verifyLabel);form.append(security);field('caFile','CA 证书路径（服务器，可选）','text',current.caFile||'',false);
 const change=()=>{schema.closest('label').hidden=engine.value!=='postgresql';database.placeholder=databaseEngines[engine.value].hint;};engine.onchange=()=>{port.value=databaseEngines[engine.value].port;change();};change();
 },async body=>{const value={id:connection?.id,enabled:current.enabled,readOnly:true};for(const key of ['name','engine','host','port','database','schema','username','password','caFile'])value[key]=body.querySelector('[name="'+key+'"]').value;value.tls=$('#db-tls',body).checked;value.verifyTls=$('#db-verify',body).checked;const saved=await databaseApi('save',value);const checked=await databaseApi('test',{id:saved.connection.id});if(checked.success&&current.enabled){const status=await databaseApi();await ensureDatabaseMcp(status);}toast(checked.success?'已保存，只读连接验证通过':'已保存，连接验证失败：'+checked.connection.error);await refresh();},'保存并测试连接');}
async function showDatabaseSchema(connection){const value=await databaseApi('schema',{id:connection.id});openDialog(connection.name+' · 表结构',body=>body.append(databaseTable(value.columns,value.rows)),async()=>{},'关闭');}
function databaseTable(columns,rows){const wrap=el('div','db-table-scroll'),table=el('table','db-result-table'),thead=el('thead'),header=el('tr');for(const column of columns)header.append(el('th','',column.name));thead.append(header);table.append(thead);const body=el('tbody');for(const row of rows){const tr=el('tr');for(const column of columns)tr.append(el('td','',row[column.name]==null?'—':String(row[column.name])));body.append(tr);}table.append(body);wrap.append(table);return wrap;}
async function showDatabaseResults(){const value=await databaseApi('results',{});openDialog('全部查询快照（当前服务）',body=>{body.append(el('p','subtle','这里展示当前服务保存的全部查询快照，包含其他分析。当前分析的结果、图表与下载直接在对应对话中展示。'));if(!value.results.length)body.append(el('p','subtle','尚无查询结果。'));for(const result of value.results){const row=el('div','db-saved-result');row.append(el('strong','',result.connectionName+' · '+result.rowCount.toLocaleString()+' 行'),el('span','subtle',new Date(result.createdAt).toLocaleString()),button('查看明细',()=>showDatabaseResult(result.resultId)),button('清理快照',async()=>{await databaseApi('clear_result',{resultId:result.resultId});row.remove();}));body.append(row);}},async()=>{},'关闭');}
async function showDatabaseResult(identifier){const data=await databaseApi('result',{resultId:identifier,offset:0,limit:100});if($('#dialog').open)$('#dialog').close();openDialog('完整结果 · '+data.rowCount.toLocaleString()+' 行',body=>{let offset=0;const box=el('div'),pager=el('div','db-toolbar'),label=el('span','subtle');const previous=button('上一页',()=>load(Math.max(0,offset-100))),next=button('下一页',()=>load(offset+100)),download=el('a','small-button','下载完整 CSV');download.href='/api/databases/results/'+identifier+'.csv';download.download='query-result.csv';pager.append(previous,label,next,download);if(data.nativeResponseAvailable){const raw=el('a','small-button','下载原生 JSON');raw.href='/api/databases/results/'+identifier+'.json';raw.download='query-result.json';pager.append(raw);}body.append(box,pager);const present=value=>{box.replaceChildren(databaseTable(value.columns,value.rows));offset=value.offset;label.textContent=(offset+1)+'–'+(offset+value.rows.length)+' / '+value.rowCount;previous.disabled=offset===0;next.disabled=!value.hasMore;};async function load(start){previous.disabled=next.disabled=true;try{present(await databaseApi('result',{resultId:identifier,offset:start,limit:100}));}catch(error){previous.disabled=offset===0;next.disabled=false;throw error;}}present(data);},async()=>{},'关闭');}
function validDatabaseChart(data){return /^[a-f0-9]{32}$/.test(data?.resultId||'')&&(data.version===2?/^[a-f0-9]{32}$/.test(data.chartId||''):data.version===1&&Array.isArray(data.rows)&&!!data.option?.series);}
function databaseChart(item){if(item.type!=='mcpToolCall'||item.status!=='completed'||item.result?.isError)return null;const value=item.result?.structuredContent?.codexWebChart;if(validDatabaseChart(value))return value;for(const content of item.result?.content||[]){if(content.type==='text'){try{const candidate=JSON.parse(content.text)?.codexWebChart;if(validDatabaseChart(candidate))return candidate;}catch{}}}return null;}
function downloadDatabaseBlob(blob,name){const link=el('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),10000);}
function databaseChartPalette(node){
  const dark=document.documentElement.dataset.theme==='dark',fallback=dark?{ink:'#eceee7',muted:'#92998d',surface:'#252825',border:'#363b35',hover:'#30362e'}:{ink:'#252724',muted:'#81857c',surface:'#fff',border:'#e3e5de',hover:'#e7e9e2'},style=typeof getComputedStyle==='function'?getComputedStyle(node):null;
  return Object.fromEntries(Object.entries(fallback).map(([name,value])=>[name,style?.getPropertyValue('--'+name).trim()||value]));
}
/* Only presentation is patched so the query dataset, series colors and the
   user's current legend selection / zoom remain owned by the same chart. */
function databaseChartThemePatch(option,colors){
  const component=(value,style)=>Array.isArray(value)?value.map(item=>({...((item?.id)?{id:item.id}:{}),...style})):({...((value?.id)?{id:value.id}:{}),...style});
  const patch={textStyle:{color:colors.ink}};
  if(option.title)patch.title=component(option.title,{textStyle:{color:colors.ink},subtextStyle:{color:colors.muted}});
  if(option.legend)patch.legend=component(option.legend,{textStyle:{color:colors.ink},pageTextStyle:{color:colors.ink},pageIconColor:colors.ink,pageIconInactiveColor:colors.border,inactiveColor:colors.muted});
  if(option.tooltip)patch.tooltip=component(option.tooltip,{textStyle:{color:colors.ink},backgroundColor:colors.surface,borderColor:colors.border,axisPointer:{label:{color:colors.ink,backgroundColor:colors.hover},lineStyle:{color:colors.muted},shadowStyle:{color:colors.hover}}});
  for(const name of ['xAxis','yAxis','radiusAxis','angleAxis'])if(option[name])patch[name]=component(option[name],{axisLabel:{color:colors.ink},nameTextStyle:{color:colors.ink},axisLine:{lineStyle:{color:colors.border}},axisTick:{lineStyle:{color:colors.border}},splitLine:{lineStyle:{color:colors.border}}});
  if(option.series)patch.series=component(option.series,{label:{color:colors.ink}});
  if(option.dataZoom)patch.dataZoom=component(option.dataZoom,{textStyle:{color:colors.ink},backgroundColor:colors.surface,borderColor:colors.border,handleStyle:{color:colors.hover,borderColor:colors.ink},moveHandleStyle:{color:colors.ink}});
  if(option.toolbox)patch.toolbox=component(option.toolbox,{iconStyle:{borderColor:colors.ink}});
  return patch;
}
/* A plot is one view of a query result. Result cards own tabs, tables and exports. */
function createDatabaseChartView(data){
  const node=el('div','db-chart-view'),plot=el('div','db-chart'),status=el('p','subtle','正在加载图表…'),retry=button('重试加载图表',()=>restart());
  node.dataset.resultId=data?.resultId||'';plot.setAttribute('role','img');plot.ariaLabel=data?.title||'查询结果图表';status.setAttribute('role','status');retry.hidden=true;node.append(plot,status,retry);
  let value=data?.version===1?data:null,chart=null,request=null,frame=null,disposed=false,connected=false,observing=false,attempt=0,failed=false,themeKey='',ready,resolveReady,rejectReady;
  function nextReady(){ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});ready.catch(()=>{});}
  nextReady();
  function fail(error){if(disposed)return;failed=true;node.dataset.rendered='false';status.className='db-error';status.setAttribute('role','alert');status.textContent='图表加载失败：'+(error?.message||String(error));retry.hidden=false;rejectReady(error instanceof Error?error:new Error(String(error)));}
  function schedule(){if(disposed||frame!==null)return;frame=requestAnimationFrame(()=>{frame=null;draw();});}
  function applyTheme(){const colors=databaseChartPalette(node),key=JSON.stringify(colors);if(key!==themeKey){chart.setOption(databaseChartThemePatch(value.option,colors),{notMerge:false});themeKey=key;}return colors;}
  function draw(){
    if(disposed||failed||!node.isConnected||!plot.isConnected||!value)return;
    const size=plot.getBoundingClientRect();if(size.width<=0||size.height<=0)return;
    try{
      if(!chart){if(typeof echarts==='undefined'||typeof echarts.init!=='function')throw new Error('图表组件尚未加载，请刷新页面后重试。');chart=echarts.init(plot,null,{renderer:'canvas'});chart.setOption(value.option,{notMerge:true});}
      else chart.resize();
      applyTheme();
      node.dataset.rendered='true';status.hidden=true;retry.hidden=true;resolveReady(chart);
    }catch(error){chart?.dispose();chart=null;themeKey='';fail(error);}
  }
  const resize=new ResizeObserver(schedule),removal=new MutationObserver(()=>{if(disposed)return;if(!node.isConnected){if(connected)dispose();}else if(!connected){connected=true;activate();}}),theme=new MutationObserver(schedule);
  function observe(){if(observing||disposed)return;observing=true;resize.observe(plot);removal.observe(document.body,{subtree:true,childList:true});theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});}
  function activate(){
    if(disposed)return ready;observe();if(!node.isConnected)return ready;connected=true;
    if(!validDatabaseChart(data)){if(!failed)fail(new Error('图表引用无效，请重新生成图表。'));return ready;}
    if(failed)return ready;
    if(value){schedule();return ready;}
    if(!request){
      const generation=attempt;status.textContent='正在读取完整图表数据…';
      request=databaseApi('read_chart',{chartId:data.chartId}).then(result=>{
        if(disposed||generation!==attempt)return;
        if(!node.isConnected){dispose();return;}
        if(!validDatabaseChart(result)||result.version!==1||result.resultId!==data.resultId)throw new Error('图表与查询结果不匹配，请重新生成图表。');
        value=result;plot.ariaLabel=result.title||plot.ariaLabel;schedule();
      }).catch(error=>{if(!disposed&&generation===attempt)fail(error);}).finally(()=>{if(generation===attempt)request=null;});
    }
    return ready;
  }
  function restart(){if(disposed)return ready;attempt++;request=null;failed=false;status.className='subtle';status.setAttribute('role','status');status.hidden=false;status.textContent='正在加载图表…';retry.hidden=true;nextReady();return activate();}
  function downloadPNG(){if(disposed)throw new Error('图表已关闭，请重新打开该结果。');if(!chart)throw new Error(failed?status.textContent:'图表仍在加载，请等待图表显示后重试。');return chart.getDataURL({pixelRatio:2,backgroundColor:applyTheme().surface});}
  function dispose(){if(disposed)return;disposed=true;attempt++;if(frame!==null){cancelAnimationFrame(frame);frame=null;}resize.disconnect();removal.disconnect();theme.disconnect();chart?.dispose();chart=null;resolveReady(null);}
  return {node,activate,downloadPNG,dispose,get ready(){return ready;}};
}
function renderDatabaseChart(data){if(typeof renderStandaloneAnalysisChart==='function')return renderStandaloneAnalysisChart(data);const view=createDatabaseChartView(data);view.activate();return view.node;}
