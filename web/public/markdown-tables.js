'use strict';
// Repair only unambiguous table syntax for display. Stored messages and evidence stay exact.
function markdownTableCells(line){
  const text=line.trim(),cells=[];let start=0,slashes=0;
  for(let i=0;i<text.length;i++){
    const char=text[i];if(char==='|'&&slashes%2===0){cells.push(text.slice(start,i));start=i+1;}
    slashes=char==='\\'?slashes+1:0;
  }
  cells.push(text.slice(start));if(cells[0]==='')cells.shift();if(cells.at(-1)==='')cells.pop();
  return cells.map(cell=>cell.trim());
}
function repairMarkdownTableDelimiters(source,parser){
  if(!source||!source.includes('|')||!source.includes('-')||typeof parser?.lexer!=='function')return source;
  let changed=false,inlineTicks=0;
  const tokens=parser.lexer(source,{gfm:true,breaks:true});
  const rendered=tokens.map(token=>{
    const continuedCode=inlineTicks!==0;
    if(token.type==='paragraph')for(const match of token.raw.matchAll(/(\\*)(`+)/g)){if(match[1].length%2)continue;const width=match[2].length;if(!inlineTicks)inlineTicks=width;else if(inlineTicks===width)inlineTicks=0;}
    // Fenced/indented code, raw HTML, quoted/list blocks and multiline code spans stay literal.
    if(continuedCode||token.type!=='paragraph'||token.tokens?.some(part=>part.type==='codespan'&&part.raw.includes('\n')))return token.raw;
    const lines=token.raw.split('\n');
    for(let i=0;i+2<lines.length;i++){
      if(/^(?: {4}|\t)/.test(lines[i])||/^(?: {4}|\t)/.test(lines[i+1]))continue;
      const header=markdownTableCells(lines[i]),delimiter=markdownTableCells(lines[i+1]);
      if(header.length<2||!lines[i+1].includes('|')||!delimiter.length||!delimiter.every(cell=>/^:?-+:?$/.test(cell))||header.length===delimiter.length)continue;
      let end=i+2;while(end<lines.length&&lines[end].trim()&&markdownTableCells(lines[end]).length>1)end++;
      if(end===i+2||!lines.slice(i+2,end).every(line=>markdownTableCells(line).length===header.length))continue;
      const indent=lines[i+1].match(/^ */)[0];
      lines[i+1]=indent+'| '+header.map((_,column)=>delimiter[column]||'---').join(' | ')+' |';changed=true;i=end-1;
    }
    return lines.join('\n');
  }).join('');
  return changed?rendered:source;
}
