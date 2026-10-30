/* Source-bound definitions are versioned on the server. This UI never grants
   tenant roles: owner/steward names are explicit declarations for the demo. */
function metricRuleEmptyDefinition(){return {name:'',description:'',table:{name:''},fields:{},recordKey:[],parameters:{},ranges:[],filters:[],groupBy:[],measures:[],formulas:[]};}
function metricRuleParseDefinition(text){
  let value;try{value=JSON.parse(text);}catch(error){throw new Error('JSON 格式不正确：'+error.message);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('口径配置必须是 JSON 对象。');
  // Pasted records only contribute their definition, never status/approval.
  const definition=value.definition??value;
  if(!definition||typeof definition!=='object'||Array.isArray(definition))throw new Error('definition 必须是 JSON 对象。');
  return definition;
}
function metricRuleStatus(record){return {draft:'草稿 · 尚未确认',confirmed:'已确认',disabled:'已停用'}[record.status]||'未知状态';}
function metricRuleSummary(definition){
  const render=value=>typeof value==='string'?value:JSON.stringify(value),fields=definition.fields||{},parameters=definition.parameters||{};
  const rounding={HALF_UP:'四舍五入',HALF_EVEN:'四舍六入五成双',DOWN:'向零截断'},operators={eq:'等于',ne:'不等于',lt:'小于',lte:'小于等于',gt:'大于',gte:'大于等于'},operations={sum:'求和',count:'非空值计数',min:'最小值',max:'最大值',mean:'平均值'};
  return [
    ['适用表',[definition.table?[definition.table.schema,definition.table.name].filter(Boolean).join('.'):'尚未配置']],
    ['字段映射',Object.entries(fields).map(([alias,spec])=>alias+' ← '+(spec?.column||'未配置列')+'；类型 '+(spec?.type||'未配置')+'；单位 '+(spec?.unit??'未配置'))],
    ['唯一记录键',Array.isArray(definition.recordKey)?definition.recordKey:[]],
    ['任务参数',Object.entries(parameters).map(([name,spec])=>name+'：'+(spec?.type||'未配置'))],
    ['区间约束',(Array.isArray(definition.ranges)?definition.ranges:[]).map(range=>range.start+' < '+range.end)],
    ['筛选范围',(Array.isArray(definition.filters)?definition.filters:[]).map(filter=>filter.field+' '+(operators[filter.op]||filter.op)+' '+(filter.parameter!==undefined?'任务参数 '+filter.parameter:render(filter.value)))],
    ['分组字段',Array.isArray(definition.groupBy)?definition.groupBy:[]],
    ['聚合指标',(Array.isArray(definition.measures)?definition.measures:[]).map(metric=>(metric.name||metric.id)+' ['+metric.id+']：'+(operations[metric.op]||metric.op)+'('+metric.field+')；单位 '+metric.unit+'；小数 '+metric.scale+' 位，'+(rounding[metric.rounding]||metric.rounding)+'；空值 '+(metric.nullPolicy==='skip'?'跳过':metric.nullPolicy==='reject'?'拒绝':metric.nullPolicy))],
    ['计算公式',(Array.isArray(definition.formulas)?definition.formulas:[]).map(formula=>(formula.name||formula.id)+' ['+formula.id+'] = '+formula.expression+'；单位 '+formula.unit+'；小数 '+formula.scale+' 位，'+(rounding[formula.rounding]||formula.rounding)+'；除零 '+(formula.zeroDivision==='null'?'返回空值':formula.zeroDivision==='error'?'报错':formula.zeroDivision))]
  ];
}
function metricRuleDefinitionView(definition){
  const root=el('div','metric-rule-summary');root.append(el('h3','',definition.name||'未命名口径'));
  if(definition.description)root.append(el('p','',String(definition.description)));
  for(const [title,values]of metricRuleSummary(definition)){
    const section=el('section');section.append(el('h4','',title));
    if(values.length){const list=el('ul');for(const value of values)list.append(el('li','',String(value)));section.append(list);}else section.append(el('p','subtle','未配置'));
    root.append(section);
  }
  return root;
}
function showMetricRules(connection){
  const existing=document.querySelector('dialog.metric-rules-dialog');if(existing){existing.focus();return;}
  const dialog=el('dialog','metric-rules-dialog'),heading=el('div','dialog-title'),title=el('h2','','指标口径 · '+connection.name),close=el('button','icon-button','×'),body=el('div','metric-rules-body'),message=el('p','metric-rules-message'),actions=el('div','dialog-actions');
  title.id='metric-rules-title';dialog.setAttribute('aria-labelledby',title.id);close.type='button';close.ariaLabel='关闭指标口径';message.setAttribute('role','status');heading.append(title,close);dialog.append(heading,body,message,actions);document.body.append(dialog);
  let busy=false,generation=0,view='list',rules=[],dirty=false,returnFocus=document.activeElement;
  const api=payload=>databaseApi('result',{metricRules:payload});
  function notice(text,error=false){message.textContent=text;message.classList.toggle('db-error',error);message.setAttribute('role',error?'alert':'status');}
  function exit(force=false){if(busy&&!force)return;if(dirty&&!window.confirm('放弃尚未保存的口径修改？'))return;dialog.close();}
  close.onclick=()=>exit();dialog.addEventListener('cancel',event=>{event.preventDefault();exit();});dialog.addEventListener('close',()=>{generation++;dialog.remove();if(returnFocus?.isConnected)returnFocus.focus();},{once:true});
  function control(label,fn,style='small-button'){const item=el('button',style,label);item.type='button';item.onclick=()=>run(fn);return item;}
  async function run(fn){
    if(busy||!dialog.isConnected)return;busy=true;dialog.setAttribute('aria-busy','true');
    const controls=[...dialog.querySelectorAll('button,input,textarea,select')].map(node=>[node,node.disabled]);for(const [node]of controls)node.disabled=true;
    try{await fn();}catch(error){if(dialog.isConnected)notice('操作失败：'+nativeErrorMessage(error)+'。未提交成功的输入会保留；若提示版本冲突，请先复制配置，再返回列表刷新。',true);}
    finally{busy=false;dialog.removeAttribute('aria-busy');for(const [node,disabled]of controls)if(node.isConnected)node.disabled=disabled;}
  }
  function reset(next){view=next;dirty=false;generation++;body.replaceChildren();actions.replaceChildren();notice('');}
  function sourceNote(){body.append(el('p','subtle metric-rule-source','绑定数据源：'+connection.name+'（'+connection.id+'）。配置会随版本记录；数据源连接配置变更后需要重新核实。'));}
  function updateRule(record){rules=rules.filter(rule=>rule.id!==record.id);rules.unshift(record);}
  function list(){
    reset('list');sourceNote();body.append(el('p','subtle','由业务负责人确定指标含义，数据维护人员配置字段与计算规则；分析人员在对话中使用已确认口径。Agent 可以提出草稿，草稿需要人工确认后才可用于口径检查。'));
    const toolbar=el('div','db-toolbar');toolbar.append(control('新增口径草稿',()=>editor(null),'solid-button'),control('刷新口径列表',load));body.append(toolbar);
    const list=el('div','metric-rule-list');if(!rules.length)list.append(el('p','metric-rule-empty','此数据源尚无指标口径。可以新建空白配置，或在编辑器中填写维护人员提供的配置。'));
    for(const record of rules){const row=el('article','metric-rule-card'),info=el('div');info.append(el('strong','',record.definition?.name||'未命名口径'),el('p','subtle','版本 '+record.version+' · '+metricRuleStatus(record)));if(record.definition?.description)info.append(el('p','',record.definition.description));row.append(info,control('查看口径',()=>detail(record)));list.append(row);}body.append(list);actions.append(control('关闭',()=>exit(true)));
  }
  async function load(){const ticket=++generation;notice('正在读取此数据源的口径…');const data=await api({operation:'list',sourceId:connection.id});if(!dialog.isConnected||ticket!==generation)return;rules=data.rules||[];list();}
  function metadata(record){const meta=el('p','subtle metric-rule-meta','版本 '+record.version+' · '+metricRuleStatus(record)+' · 数据源配置版本 '+record.sourceVersion);meta.append(el('br'),el('span','','内容指纹 '+record.hash));return meta;}
  function detail(record){
    reset('detail');sourceNote();body.append(metadata(record),metricRuleDefinitionView(record.definition));
    if(record.confirmation){const note=el('section','metric-rule-confirmation');note.append(el('h4','','确认声明'),el('p','','业务负责人：'+record.confirmation.businessOwner+'；数据维护人员：'+record.confirmation.dataSteward),el('p','',record.confirmation.note),el('p','subtle','以上为操作者填写的声明，Demo 未接入身份核验与角色审批。'));body.append(note);}
    const raw=el('details','metric-rule-raw');raw.append(el('summary','','查看完整配置 JSON'),el('pre','',JSON.stringify(record.definition,null,2)));body.append(raw);
    actions.append(control('返回列表',list),control('编辑为新草稿',()=>editor(record)));
    if(record.status==='draft')actions.append(control('核对并确认此版本',()=>confirmation(record),'solid-button'));
    if(record.status!=='disabled')actions.append(control('停用此口径',()=>disable(record)));
  }
  function editor(record){
    reset('editor');sourceNote();body.append(el('h3','',record?'编辑口径 · 保存为新草稿':'新增口径草稿'),el('p','subtle','此处面向配置维护人员。保存仅生成草稿，必须核对字段、范围、单位和公式，再单独确认。粘贴已有记录时，只采用 definition，不采用确认状态。'));
    if(record?.status==='confirmed')body.append(el('p','db-error metric-rule-edit-warning','保存新草稿后，旧的已确认版本将不能用于新的执行或回答发布；历史记录保留。新版本需要重新确认后才能继续使用。'));
    const label=el('label','db-field'),input=el('textarea','code-editor metric-rule-editor');input.name='metricRuleDefinition';input.ariaLabel='指标口径 JSON';input.spellcheck=false;input.value=JSON.stringify(record?.definition||metricRuleEmptyDefinition(),null,2);input.oninput=()=>{dirty=true;};label.append(el('span','','高级配置 JSON'),input);body.append(label);
    const helper=el('details','metric-rule-help');helper.append(el('summary','','配置字段与支持范围说明'),el('p','','name、description：名称与业务含义；table：表名与可选 schema；fields：别名到真实列、类型和单位的映射；recordKey：唯一记录键，避免重复计算。'),el('p','','parameters：任务参数类型；ranges：起始参数严格小于结束参数的约束；filters：筛选字段、比较符，以及 parameter 或 value；groupBy：分组字段别名。'),el('p','','measures：sum、count、min、max、mean 聚合，count 统计非空字段值，需配置字段、单位、保留小数位、舍入及空值策略；formulas：引用指标 ID 的加减乘除表达式，并配置单位、精度和除零策略。'),el('p','','字段类型支持 decimal、int、text、date；date 使用 YYYY-MM-DD。单位 1 表示无量纲，% 的表达式需要显式乘以 100。小数位为零至十二；舍入支持 HALF_UP、HALF_EVEN、DOWN。当前范围为单表字段、筛选、分组聚合与公式；复杂关联需先由维护人员提供合适的业务表或视图。'));
    const preview=el('div','metric-rule-preview'),tools=el('div','db-toolbar');tools.append(control('预览口径说明',()=>{preview.replaceChildren(metricRuleDefinitionView(metricRuleParseDefinition(input.value)));notice('已生成阅读预览；保存时服务端还会验证结构与单位。');}));body.append(tools,helper,preview);
    actions.append(control('取消编辑',()=>{if(dirty&&!window.confirm('放弃尚未保存的口径修改？'))return;record?detail(record):list();}),control('保存草稿',async()=>{
      const definition=metricRuleParseDefinition(input.value);notice('正在保存口径草稿…');const payload={operation:'save',sourceId:connection.id,definition};if(record){payload.id=record.id;payload.expectedVersion=record.version;}
      const data=await api(payload);updateRule(data.rule);detail(data.rule);notice('草稿已保存。确认后才能使用此版本进行口径检查。');
    },'solid-button'));
    queueMicrotask(()=>{if(input.isConnected)input.focus();});
  }
  function confirmation(record){
    reset('confirm');sourceNote();body.append(el('h3','','确认此版本的业务口径'),metadata(record),metricRuleDefinitionView(record.definition),el('p','subtle','请由了解业务含义与数据定义的人核对以上配置。下面记录的是操作者声明，Demo 不验证姓名对应身份，也不构成组织角色审批。'));
    const form=el('div','db-form'),inputs={};for(const [name,text]of [['businessOwner','业务负责人（声明）'],['dataSteward','数据维护人员（声明）'],['note','确认说明与依据']]){const label=el('label','db-field'),input=el(name==='note'?'textarea':'input','field-input');input.name=name;input.ariaLabel=text;input.maxLength=name==='note'?2000:200;input.required=true;input.oninput=()=>{dirty=true;};label.append(el('span','',text),input);if(name==='note')label.classList.add('metric-rule-full');form.append(label);inputs[name]=input;}body.append(form);
    const ack=el('label','metric-rule-ack'),checkbox=el('input');checkbox.type='checkbox';checkbox.name='metricRuleAcknowledged';checkbox.onchange=()=>{dirty=true;};ack.append(checkbox,document.createTextNode('我已核对字段映射、筛选范围、计算公式、单位与精度，并确认此版本可用于当前数据源。'));body.append(ack);
    actions.append(control('返回查看',()=>{if(dirty&&!window.confirm('放弃尚未提交的确认信息？'))return;detail(record);}),control('确认并启用此版本',async()=>{
      const confirmation=Object.fromEntries(Object.entries(inputs).map(([key,input])=>[key,input.value.trim()]));if(Object.values(confirmation).some(value=>!value))throw new Error('请填写业务负责人、数据维护人员和确认依据。');if(!checkbox.checked)throw new Error('请先勾选口径核对声明。');
      notice('正在提交此版本的确认…');const data=await api({operation:'confirm',id:record.id,version:record.version,expectedHash:record.hash,confirmation});updateRule(data.rule);detail(data.rule);notice('此版本已确认。后续检查将绑定该版本与内容指纹。');
    },'solid-button'));
  }
  function disable(record){
    reset('disable');body.append(el('h3','','停用口径'),el('p','','停用“'+record.definition.name+'”后，后续分析不能继续按此口径生成新的检查结果。已有分析记录会保留。'),metadata(record));
    actions.append(control('取消',()=>detail(record)),control('确认停用',async()=>{notice('正在停用…');const data=await api({operation:'disable',id:record.id,version:record.version,expectedHash:record.hash});updateRule(data.rule);detail(data.rule);notice('此口径已停用，历史记录保留。');},'solid-button'));
  }
  dialog.showModal();list();run(load);
}
