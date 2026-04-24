const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch();
  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    
    await page.evaluateOnNewDocument(() => {
        localStorage.setItem('language', 'ar');
    });

    console.log('Navigating to local site...');
    await page.goto('http://localhost:4174/');
    await new Promise(r => setTimeout(r, 2000));
    
    console.log('Clicking /legal...');
    await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a'));
      const legal = links.find(a => a.href.includes('/legal'));
      if(legal) legal.click();
    });
    
    await new Promise(r => setTimeout(r, 2000));
    console.log('Done.');
  } catch(e) {
    console.error(e);
  } finally {
    await browser.close();
  }
})();
