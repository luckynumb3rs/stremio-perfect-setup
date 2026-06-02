git clone --filter=blob:none --sparse https://github.com/luckynumb3rs/stremio-perfect-setup.git temp-repo
cd temp-repo
git sparse-checkout set hosting
cd ..
cp -r temp-repo/hosting ./hosting
rm -rf temp-repo