/* * */
/* IMPORTS */
const config = require("config");
const { GoogleSpreadsheet } = require("google-spreadsheet");

exports.addNewRow = async (documentID, sheetID, row) => {
  const doc = new GoogleSpreadsheet(documentID);
  await doc.useServiceAccountAuth({
    client_email: config.get("auth.google-service-account-email"),
    private_key: config.get("auth.google-service-account-private-key")
  });
  await doc.loadInfo();
  const sheet = doc.sheetsById[sheetID];
  await sheet.addRow(row);
};
