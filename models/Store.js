"use strict";

/* * * * * */
/* STORE */
/* * */

/* * */
/* IMPORTS */
const mongoose = require("mongoose");

/* * */
/* Schema for MongoDB ["Store"] Object */
module.exports = mongoose.model(
  "Store",
  new mongoose.Schema({
    name: {
      type: String,
      maxlength: 30,
      required: true,
    },
    shortName: {
      type: String,
      maxlength: 30,
      required: true,
    },
    squareLocationID: {
      type: String,
      maxlength: 30,
      required: true,
    },
    lastSyncTime: {
      type: String,
      maxlength: 30,
      required: true,
    },
  })
);
