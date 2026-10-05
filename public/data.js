// バックアップの書き出し・読み込み（DOM非依存。テストで共用）
const isNum=x=>typeof x=="number"&&Number.isFinite(x);
const isStr=x=>typeof x=="string";

export function exportData(S,now=new Date()){
  return JSON.stringify({app:"zubora-kakeibo",version:1,exportedAt:now.toISOString(),data:{goal:S.goal,items:S.items,recur:S.recur,favs:S.favs}},null,1);
}

// 形の正しいものだけ残す（壊れたファイルや別アプリのJSONで家計簿を壊さない）
// 2000年〜2100年の日時だけ受け付ける（ありえない値で月の計算が壊れないように）
const MIN_TS=Date.UTC(2000,0,1),MAX_TS=Date.UTC(2100,0,1);
const okTs=t=>isNum(t)&&t>=MIN_TS&&t<MAX_TS;
const okMonth=m=>Number.isInteger(m)&&m>=2000*12&&m<2100*12;
const okItem=i=>i&&(isNum(i.id)||isStr(i.id))&&okTs(i.ts)&&isNum(i.amount)&&i.amount>0&&isStr(i.text)&&isStr(i.cat);
const okRecur=r=>r&&(isNum(r.id)||isStr(r.id))&&isStr(r.label)&&isNum(r.amount)&&r.amount>0&&isStr(r.cat)&&okMonth(r.start)&&((Number.isInteger(r.day)&&r.day>=1&&r.day<=31)||((r.step==7||r.step==14)&&okTs(r.anchor)));
const okFav=f=>f&&isStr(f.l)&&isNum(f.a)&&f.a>0;

// 今のデータに読み込んだデータを足す（同じ記録は増やさない）。目標金額は今の設定を残す
export function importData(cur,text){
  let j;try{j=JSON.parse(text)}catch(e){throw new Error("not_json")}
  const d=j&&j.app=="zubora-kakeibo"&&j.data?j.data:j;
  if(!d||!Array.isArray(d.items))throw new Error("not_backup");
  const out={goal:cur.goal,items:[...cur.items],recur:[...(cur.recur||[])],favs:[...(cur.favs||[])]};
  const ids=new Set(out.items.map(i=>String(i.id))),rids=new Set(out.recur.map(r=>String(r.id)));
  let items=0,recur=0,favs=0;
  for(const i of d.items)if(okItem(i)&&!ids.has(String(i.id))){out.items.push(i);ids.add(String(i.id));items++}
  for(const r of d.recur||[])if(okRecur(r)&&!rids.has(String(r.id))){out.recur.push(r);rids.add(String(r.id));recur++}
  for(const f of d.favs||[])if(okFav(f)&&!out.favs.some(x=>x.l==f.l&&x.a==f.a)){out.favs.push(f);favs++}
  if(!cur.items.length&&!cur.recur?.length&&isNum(d.goal)&&d.goal>0)out.goal=d.goal; // 新しい端末への引っ越しなら目標も移す
  return{data:out,added:{items,recur,favs}};
}

// 一番古い記録の月が、今月から何か月前か（0 = 今月）
export function earliestOffset(S,now=new Date()){
  const cur=now.getFullYear()*12+now.getMonth();let min=cur;
  for(const i of S.items){const d=new Date(i.ts);min=Math.min(min,d.getFullYear()*12+d.getMonth())}
  for(const r of S.recur||[])min=Math.min(min,r.start);
  return min-cur;
}

// 記録のある一番古い月（年*12+月）。記録がなければ null
export function earliestMonthKey(S){
  let min=null;
  for(const i of S.items){const d=new Date(i.ts),k=d.getFullYear()*12+d.getMonth();if(min==null||k<min)min=k}
  for(const r of S.recur||[])if(min==null||r.start<min)min=r.start;
  return min;
}

// 月末のバックアップが必要か。月末の日はその月の分、それ以外の日は先月の分を見る。
// その月の分を「月末の日以降」に書き出していれば済み。対象の月より前から記録がある場合だけ促す
export function backupDue(now,lastExportTs,earliestKey){
  const Y=now.getFullYear(),M=now.getMonth(),D=now.getDate();
  const isLast=new Date(Y,M+1,0).getDate()==D;
  const t=isLast?new Date(Y,M,1):new Date(Y,M-1,1);
  const key=t.getFullYear()*12+t.getMonth();
  const windowStart=isLast?new Date(Y,M,D).getTime():new Date(Y,M,0).getTime();
  const due=earliestKey!=null&&earliestKey<=key&&!(lastExportTs>=windowStart);
  return{due,y:t.getFullYear(),m:t.getMonth()};
}
