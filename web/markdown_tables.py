"""Validate table shape before publishing analytical conclusions; never edit values."""
import re


def cells(line):
    text=line.strip();parts=[];start=0;slashes=0
    for index,char in enumerate(text):
        if char=='|' and slashes%2==0:
            parts.append(text[start:index]);start=index+1
        slashes=slashes+1 if char=='\\' else 0
    parts.append(text[start:])
    if parts and parts[0]=='':parts.pop(0)
    if parts and parts[-1]=='':parts.pop()
    return [part.strip() for part in parts]


def validate_published_tables(text):
    lines=text.splitlines();fence=None;literal=None;index=0
    while index<len(lines):
        line=lines[index]
        if literal:
            if re.search(r'</'+literal+r'\s*>',line,re.I):literal=None
            index+=1;continue
        tag=re.match(r'^ {0,3}<(pre|code|script|style|textarea)(?:\s|>)',line,re.I)
        if tag:
            name=tag[1].lower()
            if not re.search(r'</'+name+r'\s*>',line,re.I):literal=name
            index+=1;continue
        marker=re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$',line)
        if fence:
            if marker and marker[1][0]==fence[0] and len(marker[1])>=len(fence) and not marker[2].strip():fence=None
            index+=1;continue
        if marker:fence=marker[1];index+=1;continue
        if index+1>=len(lines) or re.match(r'^(?: {4}|\t)',line):index+=1;continue
        header=cells(line);separator=lines[index+1];alignment=cells(separator)
        if len(header)<2 or '|' not in separator or not alignment or not all(re.fullmatch(r':?-+:?',cell) for cell in alignment):index+=1;continue
        if len(header)!=len(alignment):
            raise ValueError(f'Markdown 表格表头有 {len(header)} 列，分隔行有 {len(alignment)} 列；请让表头、分隔行和每条数据行列数一致，再重新 publish_answer。不要改动数值。')
        row=index+2
        while row<len(lines) and lines[row].strip() and len(cells(lines[row]))>1:
            if len(cells(lines[row]))!=len(header):raise ValueError('Markdown 表格数据行与表头列数不一致；请保留所有字段，补全表格结构后重新 publish_answer，不能丢弃数据。')
            row+=1
        index=max(index+2,row)
