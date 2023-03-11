mkdir layers
mv node_modules/playwright-core .
zip -r chromium.zip playwright-core -q
zip -r node_modules.zip node_modules -q
mv -t layers node_modules.zip chromium.zip

# move playwright-core back into node_modules for serverless build
mv playwright-core node_modules/