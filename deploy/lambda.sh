mkdir layers
mv node_modules/playwright-core .
zip -r chromium.zip layers/playwright-core 
zip -r node_modules.zip node_modules
mv -t layers node_modules.zip chromium.zip