#!/bin/sh
# Restores the .js file names that were changed for Gmail.
find . -name "*.js.txt" | while read -r f; do
  mv "$f" "${f%.txt}"
done
echo "Done. File names are restored. Now run: npm install && npm start"
