export function compactToolText(text:string,limit:number) {
 const clean=text.replace(/\n[\t ]*\n(?:[\t ]*\n)+/g,'\n\n');
 if(clean.length<=limit)return clean;
 const tail=Math.floor(limit/3);
 return clean.slice(0,limit-tail)+'\n[Середина длинного вывода сокращена; полный текст сохранён в журнале инструмента.]\n'+clean.slice(-tail);
}
