import assert from 'node:assert/strict';
import {expect} from '@playwright/test';

/** Production app regression: keep caches private during checks, retain only a
 * successfully revalidated identical view, and abort/discard on invalidation. */
export async function checkSessionRevalidation({make,fixture,origin,checks,openExport}) {
 const backend=async()=>await (await fetch(fixture.backendOrigin+'/fixture')).json();
 const mode=async value=>{await fetch(fixture.backendOrigin+'/fixture/state/'+value);};
 const history=page=>page.getByRole('region',{name:'Finding history',exact:true});
 const exported=page=>page.getByRole('region',{name:'Review export',exact:true});
 const heading=page=>page.getByRole('heading',{name:/PR 7/});
 const openQueue=async page=>{const d=page.locator('.queue-disclosure');if(!await d.evaluate(el=>el.open))await d.locator('summary').click();};
 const ready=async(identity=fixture.alice)=>{await mode('protocol');const view=await make(identity);await view.page.goto(origin+'/?review='+fixture.reviewId);await expect(heading(view.page)).toBeVisible();await view.page.getByRole('link',{name:'Retained evidence reference',exact:true}).click();await history(view.page).getByRole('button',{name:'Read complete history',exact:true}).click();await expect(history(view.page).getByText('Complete captured history through version 2; 2 verified pages.',{exact:true})).toBeVisible();await openExport(view.page);await exported(view.page).getByRole('button',{name:'Verify complete export',exact:true}).click();await expect(exported(view.page).getByRole('button',{name:'Download verified snapshot',exact:true})).toBeVisible();await openQueue(view.page);await view.page.getByLabel('Filter authorized reviews',{exact:true}).fill('PR 8');return view;};
 const holdNext=async page=>{
  let held=false,release,override;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/api/session',async route=>{if(!held){held=true;await gate;if(override?.status){await route.fulfill({status:override.status,contentType:'application/json',body:'{}'});return;}if(override?.cookie){await route.continue({headers:{...route.request().headers(),cookie:override.cookie}});return;}}await route.continue();});
  return {held:()=>held,release:value=>{override=value;release();},clear:()=>page.unroute('**/api/session')};
 };
 const assertHidden=async page=>{
  await expect(heading(page)).toBeHidden();
  await expect(page.getByRole('button',{name:'Download verified snapshot',exact:true})).toBeHidden();
  await expect(page.getByLabel('Filter authorized reviews',{exact:true})).toBeHidden();
 };
 const assertRestored=async page=>{
  await expect(heading(page)).toBeVisible();
  await expect(exported(page).getByRole('button',{name:'Download verified snapshot',exact:true})).toBeVisible();
  await expect(history(page).getByText('Complete captured history through version 2; 2 verified pages.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Filter authorized reviews',{exact:true})).toHaveValue('PR 8');
  await expect(page.getByRole('tab',{name:'Evidence',exact:true})).toHaveAttribute('aria-selected','true');
  assert.equal(await page.locator('details[data-export]').evaluate(el=>el.open),true);
 };
 const retained=await ready();
 try {
  for(const trigger of ['focus','periodic']){
   const before=await backend(),gate=await holdNext(retained.page);
   try {
    if(trigger==='focus')await retained.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await expect.poll(gate.held,{timeout:35000}).toBe(true);
    await assertHidden(retained.page);
    gate.release();await assertRestored(retained.page);
    assert.equal((await backend()).reads,before.reads,'healthy revalidation must not remount/refetch the exact admission');
   } finally {gate.release();await gate.clear();}
  }
  checks.push('healthy focus and actual 30-second poll conceal pending content then preserve exact-view filter, disclosure, verified export and history without backend refetch');
 } finally {await retained.context.close();}
 for(const kind of ['history','export']){
  const view=await ready();
  try {
   await mode('protocol-held-'+kind);
   const before=await backend();
   await (kind==='history'?history(view.page):exported(view.page)).getByRole('button',{name:kind==='history'?'Read complete history':'Verify complete export',exact:true}).click();
   await expect.poll(async()=>(await backend()).activeRetainedReads).toBe(1);
   const gate=await holdNext(view.page);
   try {
    await view.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(gate.held).toBe(true);await assertHidden(view.page);
    assert.equal((await backend()).activeRetainedReads,1);assert.equal((await backend()).abortedRetainedReads,before.abortedRetainedReads);
    gate.release();await expect(heading(view.page)).toBeVisible();
    await expect((kind==='history'?history(view.page):exported(view.page)).getByRole('button',{name:'Stop read',exact:true})).toBeVisible();
    await fetch(fixture.backendOrigin+'/fixture/release');await assertRestored(view.page);
    assert.equal((await backend()).abortedRetainedReads,before.abortedRetainedReads);
   } finally {gate.release();await gate.clear();}
  } finally {await view.context.close();}
 }
 checks.push('in-flight history and export survive concealed healthy revalidation, retain their buffers and finish only through verified final page/end/EOF');
 for(const failure of ['unavailable','revoked','changed']){
  const view=await ready(failure==='revoked'?fixture.revalidationUser:fixture.alice);
  try {
   await mode('protocol-held-history');await history(view.page).getByRole('button',{name:'Read complete history',exact:true}).click();await expect.poll(async()=>(await backend()).activeRetainedReads).toBe(1);
   const before=await backend(),gate=await holdNext(view.page);
   try {
    await view.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(gate.held).toBe(true);await assertHidden(view.page);
    if(failure==='revoked')await fetch(fixture.backendOrigin+'/fixture/revoke-revalidation');
    if(failure==='changed')await view.context.addCookies([{name:'__Host-agentci-session',value:fixture.bob.id,domain:'127.0.0.1',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
    gate.release(failure==='unavailable'?{status:503}:failure==='changed'?{cookie:'__Host-agentci-session='+fixture.bob.id}:undefined);
    await expect(view.page.getByRole('heading',{name:failure==='revoked'?'Session expired or revoked':failure==='changed'?'Session changed':'Session verification unavailable',exact:true})).toBeVisible();
    await expect.poll(async()=>(await backend()).activeRetainedReads).toBe(0);
    assert.equal((await backend()).abortedRetainedReads,before.abortedRetainedReads+1);
    await expect(view.page.locator('[data-session-content]')).toHaveCount(0);
    await expect(view.page.getByRole('button',{name:'Download verified snapshot',exact:true})).toHaveCount(0);
    await fetch(fixture.backendOrigin+'/fixture/release');
    if(failure==='unavailable'){await view.page.unroute('**/api/session');await view.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(heading(view.page)).toBeVisible();await openQueue(view.page);await expect(view.page.getByLabel('Filter authorized reviews',{exact:true})).toHaveValue('');await openExport(view.page);await expect(exported(view.page).getByRole('button',{name:'Download verified snapshot',exact:true})).toHaveCount(0);}
   } finally {gate.release();await view.page.unroute('**/api/session');}
  } finally {await view.context.close();}
 }
 checks.push('unavailable, actual revocation and account change discard concealed cached proofs/filter and abort retained sockets; renewed valid access cannot restore invalidated state');
 const changedAdmission=await ready();
 try {
  await fetch(fixture.backendOrigin+'/fixture/change-admission');
  await changedAdmission.page.getByRole('button',{name:'Refresh read',exact:true}).click();
  await expect(changedAdmission.page.getByRole('heading',{name:'Review unavailable',exact:true})).toBeVisible();
  await expect(changedAdmission.page.getByRole('button',{name:'Download verified snapshot',exact:true})).toHaveCount(0);
  await expect(changedAdmission.page.getByRole('heading',{name:'Unsupported authorization assertion',exact:true})).toHaveCount(0);
  await openQueue(changedAdmission.page);await expect(changedAdmission.page.getByLabel('Filter authorized reviews',{exact:true})).toHaveValue('');
 } finally {await fetch(fixture.backendOrigin+'/fixture/restore-admission');await changedAdmission.context.close();}
 checks.push('same-session RSC change of exact admission destroys old retained proofs before a mismatched upstream subject fails closed');
 await mode('queued');assert.equal((await backend()).mutations,0);
}
