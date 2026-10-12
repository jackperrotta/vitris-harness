/** Each task owns an isolated browser context and uniquely named evidence. */
export async function runBrowserTasks<T>(items: T[], concurrency: number, run: (item: T, index: number) => Promise<void>): Promise<void> {
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) throw new Error('Browser concurrency must be an integer from 1 to 4');
  let next=0;
  const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,items.length)},async()=>{
    while(next<items.length){const index=next++;await run(items[index]!,index);}
  }));
  const failed=results.find(result=>result.status==='rejected');
  if(failed?.status==='rejected')throw failed.reason;
}
