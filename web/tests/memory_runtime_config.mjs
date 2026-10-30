// Production config mapper; no model/server requests. Regression for the actual
// native "expected boolean memories.dual_write" failure after refresh.
import fs from 'node:fs';import vm from 'node:vm';import test from 'node:test';import assert from 'node:assert/strict';
const file=fs.readFileSync(new URL('../public/native-ui.js',import.meta.url),'utf8');
const code=file.slice(file.indexOf('function threadRuntimeConfig('),file.indexOf('function currentMode(',file.indexOf('function threadRuntimeConfig(')));
function config(state){const context=vm.createContext({state});vm.runInContext(code,context);return JSON.parse(JSON.stringify(context.threadRuntimeConfig('deepseek')));}
test('nullable native fields are omitted before returning config to native',()=>{
 const state={runtimeDefaults:{features:{memories:true},memories:{dual_write:null,disable_on_external_context:null,max_unused_days:null,version:null,extract_model:null}}};
 const value=config(state);assert(!Object.hasOwn(value.memories,'dual_write'));assert.equal(value.memories.disable_on_external_context,true);assert(!Object.hasOwn(value.memories,'max_unused_days'));assert(!Object.values(value.memories).includes(null));assert.equal(value.memories.version,'v2');assert.equal(value.memories.extract_model,'deepseek-flash');
});
test('explicit false and zero remain valid retention settings',()=>{
 const value=config({runtimeDefaults:{memories:{dual_write:false,max_unused_days:0,max_rollout_age_days:30}}});assert.equal(value.memories.dual_write,false);assert.equal(value.memories.max_unused_days,0);assert.equal(value.memories.max_rollout_age_days,30);assert.equal(value.memories.min_rollout_idle_hours,1);
});
test('pause disables both injection and generation',()=>{
 const value=config({analysisUserMemory:{paused:true},runtimeDefaults:{features:{memories:true}}});assert.equal(value.features.memories,false);assert.equal(value.memories.generate_memories,false);assert.equal(value.memories.use_memories,false);assert.equal(value.memories.dedicated_tools,false);
});
test('explicit disabled native feature is respected',()=>{
 assert.equal(config({runtimeDefaults:{features:{memories:false}}}).features.memories,false);
});
test('DeepSeek compaction config and auxiliary identity remain explicit',()=>{
 const value=config({runtimeDefaults:{}});assert.equal(value.model_auto_compact_token_limit_scope,'total');assert.equal(value.model_post_turn_compact_threshold_percent,100);assert.equal(value.memories.consolidation_model,'deepseek-flash');assert.equal(value.features.memories,false);assert.equal(value.memories.generate_memories,false);assert.equal(value.memories.dedicated_tools,false);
});

test("legacy browser roots do not own background jobs or share temporary task context",()=>{const value=config({runtimeDefaults:{features:{memories:true}}});assert.equal(value.features.memories,false);assert.equal(value.memories.use_memories,false);assert.equal(value.memories.generate_memories,false);});

test('service-owned native runtime enables native tools without sharing raw task history',()=>{const value=config({status:{nativeProcessLifetime:'web-service'},runtimeDefaults:{features:{memories:true}}});assert.equal(value.features.memories,true);assert.equal(value.memories.use_memories,true);assert.equal(value.memories.dedicated_tools,true);assert.equal(value.memories.generate_memories,false);assert.equal(value.memories.disable_on_external_context,true);});
test('paused service-owned threads retain native tools disabled',()=>{const value=config({status:{nativeProcessLifetime:'web-service'},analysisUserMemory:{paused:true},runtimeDefaults:{features:{memories:true}}});assert.equal(value.features.memories,false);assert.equal(value.memories.use_memories,false);assert.equal(value.memories.generate_memories,false);});
