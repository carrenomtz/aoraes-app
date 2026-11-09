Pruebas de firestore.rules con el emulador de Firestore (necesita Java 11+ y Node).
No se ejecutan en CI ni se publican en el sitio (Pages excluye esta carpeta).

  cd tests-emulador
  npm init -y && npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10
  echo '{"emulators":{"firestore":{"host":"127.0.0.1","port":8080},"ui":{"enabled":false}}}' > firebase.json
  EXPECT_HOLE_CLOSED=1 npx firebase emulators:exec --only firestore --project demo-aoraes \
    "node reglas.test.mjs ../firestore.rules 'reglas actuales'"

Debe terminar con «10 ok, 0 fallos».
