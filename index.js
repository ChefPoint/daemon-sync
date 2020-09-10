"use strict";

/* * * * * */
/* CHEF POINT - DAEMON SYNC */
/* * */

/* * */
/* IMPORTS */
const database = require("./services/database");
const logger = require("./services/logger");
const syncAPI = require("./services/syncAPI");
const Store = require("./models/Store");

/* * */
/* At program initiation all stores are retrieved from the database */
/* and, for each store, orders are retrieved from Square API. */
/* Each order is formated into a Transaction and saved to the database. */
(async () => {
  // Store start time for logging purposes
  const startTime = process.hrtime();

  logger("****************************************");
  logger(new Date().toISOString());
  logger("****************************************");

  logger("Starting...");
  await database.connect();

  // Get all store locations from the database
  const stores = await Store.find({});

  // For each store, sync it's transactions
  for (const store of stores) {
    logger();
    logger(
      "------------------------------------------------------------------------------------------------------------------------"
    );
    logger("Syncing [" + store.name + "]...");
    await syncStoreTransactions(store);
    logger("----------------------------------------");
  }

  logger();
  logger("- - - - - - - - - - - - - - - - - - - -");
  logger("Shutting down...");

  await database.disconnect();

  logger("Operation took " + getDuration(startTime) / 1000 + " seconds.");
  logger("- - - - - - - - - - - - - - - - - - - -");
  logger();
})();

/* * */
/* The caller provides the store object containing squareLocationID and lastSyncTime. */
/* Two operations are performed in this function: */
/* First, orders are retrieved from Square, formated into transactions */
/* and saved to the database. */
/* Second, for the most recent transaction, it's closed_at date value */
/* is saved as the lastSyncTime value for the store. */
/* This is what keeps track of which transactions were synced and which were not. */
const syncStoreTransactions = async (store) => {
  // First, get orders from Square
  const orders = await syncAPI.getOrdersFromSquare(
    store.squareLocationID,
    store.lastSyncTime
  );

  // If response is empty, return no new orders to sync
  if (!orders) return logger("No new orders to sync.");
  else logger("Syncing " + orders.length + " orders...");

  // If response is not empty:
  // For each order,
  for (const [index, order] of orders.entries()) {
    // Clear console output
    process.stdout.write("                                        \r");

    // Check the validity of the order
    // 1) If a sale has no items:
    if (typeof order.line_items == "undefined") {
      logger("Invalid order.");
      logger("Order has no items.");
      logger("Order ID: " + order.id);
      continue;
    }

    if (config.get("general.verbose-logging")) {
      process.stdout.write("Syncing order " + index + " of " + orders.length);
      process.stdout.write(" [" + order.id + "]\r");
    }

    // Format and save it to the database
    await syncAPI.formatOrderIntoTransaction(order, store);

    // Check if it's date is more recent than this store's last sync time,
    // and update store location with the latest time orders were synced.
    await store
      .set({
        lastSyncTime: syncAPI.compareSyncDates(
          order.closed_at,
          store.lastSyncTime
        ),
      })
      .save();
  }

  // Log successful operation.
  if (config.get("general.verbose-logging"))
    process.stdout.write("                                                 \n");
  logger("Done. " + orders.length + " orders synced.");
  logger("Last transaction was at " + store.lastSyncTime);
};

/* * */
/* Returns a time interval for a provided start time. */
const getDuration = (startTime) => {
  const interval = process.hrtime(startTime);
  return parseInt(
    // seconds -> miliseconds +
    interval[0] * 1000 +
      // + nanoseconds -> miliseconds
      interval[1] / 1000000
  );
};
