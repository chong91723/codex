import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import test from 'node:test';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),start=source.indexOf('const IMAGE_ATTACHMENT_BUDGET='),end=source.indexOf('async function fileBrowser(',start);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jP1sAAAAASUVORK5CYII=','base64');
function fixture(){
 const draft={attachments:[]},notices=[];
 const context=vm.createContext({Blob,atob,Array,Error,FileReader:class{readAsDataURL(blob){blob.arrayBuffer().then(data=>{this.result='data:'+blob.type+';base64,'+Buffer.from(data).toString('base64');this.onload();});}},Image:class{naturalWidth=1;naturalHeight=1;set src(value){queueMicrotask(()=>this.onload());}},composerState:()=>draft,renderAttachments(){},toast:value=>notices.push(value)});
 vm.runInContext(source.slice(start,end),context);return {draft,notices,context};
}
test('non-images including disguised text are rejected and existing picture stays',async()=>{
 const f=fixture();await f.context.readAttachments([new File([png],'photo.png',{type:'image/png'})]);
 for(const name of ['data.xlsx','data.xls','data.csv','data.json','data.txt','data.md','data.markdown','data.sql','audio.mp3','vector.svg','archive.zip','fake.png'])await f.context.readAttachments([new File(['not an image'],name,{type:'image/png'})]);
 assert.equal(f.draft.attachments.length,1);assert.equal(f.notices.length,12);assert(f.notices.every(value=>/图片/.test(value)));
});
test('actual image bytes determine MIME; output remains native image input',async()=>{
 const f=fixture();await f.context.readAttachments([new File([png],'photo.PNG',{type:'application/octet-stream'})]);
 const inputs=f.context.imageAttachmentInputs(f.draft.attachments);
 assert.equal(inputs[0].type,'image');assert(inputs[0].url.startsWith('data:image/png;base64,'));assert.equal(f.draft.attachments[0].preview,inputs[0].url);
 assert.equal(f.draft.attachments[0].name,'photo.PNG');
});
test('outbound validation rejects audio, raw text attachments, remote paths and spoofed data',()=>{
 const f=fixture();for(const input of [{type:'audio',url:'data:audio/wav;base64,AAAA'},{type:'text',text:'spreadsheet'},{type:'localImage',path:'/tmp/fake.png'},{type:'image',url:'https://example.com/photo.png'},{type:'image',url:'data:image/png;base64,bm90IGFuIGltYWdl'},{type:'image',url:'data:image/jpeg;base64,'+png.toString('base64')}])assert.throws(()=>f.context.imageAttachmentInputs([{name:'attachment',input}]));
});
test('total image budget rejects additional picture without losing the first',async()=>{
 const f=fixture(),large=Buffer.alloc(9*1024*1024);png.copy(large);
 await f.context.readAttachments([new File([large],'first.png'),new File([large],'second.png')]);
 assert.equal(f.draft.attachments.length,1);assert(f.notices.some(value=>value.includes('总量')));
});
test('decode failure gives feedback and preserves previously added picture',async()=>{
 const f=fixture();await f.context.readAttachments([new File([png],'ok.png')]);
 f.context.Image=class{set src(value){queueMicrotask(()=>this.onerror());}};
 await f.context.readAttachments([new File([png],'corrupt.png')]);
 assert.equal(f.draft.attachments.length,1);assert(f.notices.some(value=>value.includes('无法解码')));
});
