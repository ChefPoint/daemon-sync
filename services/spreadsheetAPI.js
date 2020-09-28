"use strict";

/* * * * * */
/* SPREADSHEET API */
/* * */

/* * */
/* IMPORTS */
const config = require("config");
const { GoogleSpreadsheet } = require("google-spreadsheet");

exports.addNewRow = async (documentID, sheetID, row) => {
  // console.log("Waiting...");
  // await new Promise(resolve => setTimeout(resolve, 1000));
  // -------------------
  return;
  const doc = new GoogleSpreadsheet(documentID);
  await doc.useServiceAccountAuth({
    client_email: config.get("secrets.google-service-account-email"),
    private_key: config
      .get("secrets.google-service-account-private-key")
      .replace(/\\n/g, "\n"), // Fix for newline in Balena Dashboard Environment Variables
  });
  await doc.loadInfo();
  const sheet = doc.sheetsById[sheetID];
  await sheet.addRow(row);
};
