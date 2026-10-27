// Exercise visible sidebar management and composer commands; never dispatch product functions or RPC.
export async function openThreadMenu(page,{threadId=null,via='trigger'}={}){
  const id=threadId??await page.evaluate(()=>state.thread?.id);
  if(!id)throw new Error('A sidebar thread ID is required to open its menu');
  const escaped=String(id).replaceAll('\\','\\\\').replaceAll('"','\\"');
  const row=page.locator(`.thread-row[data-thread-id="${escaped}"]`);
  await row.waitFor({state:'visible'});
  if(via==='contextmenu')await row.click({button:'right'});
  else if(via==='trigger')await row.locator('.menu-trigger').click();
  else throw new Error('Unknown thread-menu input: '+via);
  const menu=page.locator('#thread-context-menu[role="menu"]');
  await menu.waitFor({state:'visible'});
  if(await menu.getAttribute('data-thread-id')!==String(id))throw new Error('Sidebar menu targets a different conversation');
  return menu;
}

export async function threadAction(page,action,options={}){
  if(!/^[a-z]+$/.test(action))throw new Error('Invalid thread action: '+action);
  const commands={fork:'fork',export:'export',compact:'compact',review:'review',revert:'rollback'};
  if(commands[action]){
    const current=await page.evaluate(()=>state.thread?.id);
    if(options.threadId&&options.threadId!==current)throw new Error('Composer commands act on the open conversation; select the target first');
    return composerThreadCommand(page,commands[action]);
  }
  const menu=await openThreadMenu(page,options);
  await menu.locator(`[role="menuitem"][data-thread-action="${action}"]`).click();
  await menu.waitFor({state:'hidden'});
}

export async function composerThreadCommand(page,command){
  if(!/^(compact|fork|export|review|rollback)$/.test(command))throw new Error('Unknown composer thread command: '+command);
  await page.locator('#prompt').fill('/'+command);
  await page.locator('#menu-'+command).click();
  if(await page.locator('#prompt').inputValue()!=='/'+command)throw new Error('Command selection must only fill the input');
  await page.locator('#command-menu').waitFor({state:'hidden'});
  await page.locator('#prompt').press('Enter');
}
