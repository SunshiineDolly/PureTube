export function previewFrames(spec:string){
 const [template,...levels]=spec.split('|')
 const choices=levels.flatMap((level,index)=>{
   const [w,h,n,c,r,interval,name,signature]=level.split('#'),width=Number(w),height=Number(h),count=Number(n),cols=Number(c),rows=Number(r)
   if(![width,height,count,cols,rows].every(x=>Number.isInteger(x)&&x>0)||cols>20||rows>20||count>20000||!name||!signature)return []
   return [{width,height,count,cols,rows,name,signature,index}]
 })
 const level=choices.find(v=>v.width>=160)??choices.at(-1)
 if(!level)return
 function frame(at:number){
   const chosen=Math.min(level!.count-1,Math.max(0,at)),sheet=Math.floor(chosen/(level!.cols*level!.rows)),tile=chosen%(level!.cols*level!.rows)
   const url=new URL(template.replaceAll('$L',String(level!.index)).replaceAll('$N',level!.name.replaceAll('$M',String(sheet))))
   if(url.protocol!=='https:'||url.hostname!=='i.ytimg.com')throw Error('Invalid preview image')
   url.searchParams.set('sigh',level!.signature)
   return {url:url.href,x:level!.cols>1?tile%level!.cols/(level!.cols-1)*100:0,y:level!.rows>1?Math.floor(tile/level!.cols)/(level!.rows-1)*100:0,cols:level!.cols,rows:level!.rows}
 }
 try{frame(0);return {frame,count:level.count}}catch{return}
}
