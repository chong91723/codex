// Browser draft persistence must retain explicit native UserInput.skill intent.
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),code=source.slice(source.indexOf('function composerState('),source.indexOf('\nfunction resizePrompt('));
const skill={name:'openai-docs',path:'/tmp/codex-audit/profile/skills/.system/openai-docs/SKILL.md'};
function fixture(storage=new Map()){
 const state={composers:new Map(),composerKey:'one'},messages=[],context=vm.createContext({state,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},toast:value=>messages.push(value),report:()=>{},nativeErrorMessage:error=>error.message});vm.runInContext(code,context);return{state,context,storage,messages};
}
test('selected native skill and draft text survive a fresh page context',()=>{
 const f=fixture(),draft=f.context.composerState();draft.text='$openai-docs 请检查当前模型配置';draft.skills=[{...skill}];f.context.persistDrafts();assert.equal(JSON.parse(f.storage.get('codex.drafts')).one,draft.text);const reopened=fixture(f.storage).context.composerState();assert.deepEqual(JSON.parse(JSON.stringify(reopened.skills)),[skill]);assert.equal(reopened.text,draft.text);
});
test('draft skill selections stay isolated per conversation and empty drafts clear stale selections',()=>{
 const f=fixture();for(const key of ['one','two']){const draft=f.context.composerState(key);draft.text='$openai-docs '+key;draft.skills=[{...skill,name:key,path:skill.path+'/'+key}];}f.context.persistDrafts();const reopened=fixture(f.storage);assert.equal(reopened.context.composerState('one').skills[0].name,'one');assert.equal(reopened.context.composerState('two').skills[0].name,'two');reopened.context.composerState('one').text='';reopened.context.persistDrafts();assert(!Object.hasOwn(JSON.parse(f.storage.get('codex.draftSkills')),'one'));assert(Object.hasOwn(JSON.parse(f.storage.get('codex.draftSkills')),'two'));
});
test('legacy text-only drafts remain readable and malformed stored metadata is ignored',()=>{
 const storage=new Map([['codex.drafts',JSON.stringify({one:'旧版未发送内容'})],['codex.draftSkills',JSON.stringify({one:[null,{},'wrong',skill]})]]),f=fixture(storage);assert.equal(f.context.composerState().text,'旧版未发送内容');assert.deepEqual(JSON.parse(JSON.stringify(f.context.composerState().skills)),[skill]);const corrupt=fixture(new Map([['codex.drafts','{"one":"保留文本"}'],['codex.draftSkills','not-json']]));assert.equal(corrupt.context.composerState().text,'保留文本');assert.deepEqual(JSON.parse(JSON.stringify(corrupt.context.composerState().skills)),[]);
});
test('deleting a conversation clears both its text and native skill draft metadata only',()=>{
 const storage=new Map([['codex.drafts',JSON.stringify({one:'a',two:'b'})],['codex.draftSkills',JSON.stringify({one:[skill],two:[skill]})]]),f=fixture(storage);f.context.composerState();f.context.forgetThreadDraft('one');assert.deepEqual(JSON.parse(storage.get('codex.drafts')),{two:'b'});assert.deepEqual(JSON.parse(storage.get('codex.draftSkills')),{two:[skill]});assert(!f.state.composers.has('one'));
});
