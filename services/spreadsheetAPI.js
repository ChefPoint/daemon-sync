/* * */
/* IMPORTS */
const config = require("config");
const { GoogleSpreadsheet } = require("google-spreadsheet");

const doc = new GoogleSpreadsheet(config.get("menuTP.spreadsheet-id"));

exports.addNewRow = async row => {
  await doc.useServiceAccountAuth({
    client_email: config.get("auth.google-service-account-email"),
    private_key: config.get("auth.google-service-account-private-key")
  });
  await doc.loadInfo();
  const sheet = doc.sheetsById[0];
  await sheet.addRow(row);
};
