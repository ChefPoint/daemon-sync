/* * */
/* * */
/* * * * * */
/* SYNC */
/* * */
/* * */

/* * */
/* IMPORTS */
const mongoose = require("mongoose");
const logger = require("../services/logger");
const syncAPI = require("../services/syncAPI");
const { Store } = require("../models/Store");

/* * */
/* At program initiation all stores are retrieved from the database */
/* and, for each store, orders are retrieved from Square API. */
/* Each order is formated into a Transaction and saved to the database. */
module.exports = async () => {
  // Get all store locations from the database
  const stores = await Store.find({});

  // For each store, sync it's transactions
  for (const store of stores) {
    logger.info("Syncing orders for [" + store.name + "]...");
    await syncStoreTransactions(store);
  }

  // Disconnect from the database after program completion
  await mongoose.disconnect();
  logger.info("Disconnected from MongoDB.");
};

/* * */
/* The caller provides the store object containing squareLocationID and lastSyncTime. */
/* Two operations are performed in this function: */
/* First, orders are retrieved from Square, formated into transactions */
/* and saved to the database. */
/* Second, for the most recent transaction, it's closed_at date value */
/* is saved as the lastSyncTime value for the store.  */
/* This is what keeps track of which transactions were synced which were not.  */
const syncStoreTransactions = async store => {
  // First, get orders from Square
  const orders = await syncAPI.getOrdersFromSquare(
    store.squareLocationID,
    store.lastSyncTime
  );

  // If response is empty, return no new orders to sync
  if (!orders) return logger.info("No new orders to sync.");
  else logger.info("Syncing " + orders.length + " orders...");

  // If response is not empty:
  // For each order,
  for (const order of orders) {
    // Check the validity of the order
    // 1) If a sale has no items:
    if (typeof order.line_items == "undefined") {
      logger.error("Invalid order.", "Order has no items.", order);
      continue;
    }

    // Format and save it to the database
    await syncAPI.formatOrderIntoTransaction(order, store.name);

    // and check if it's date is more recent than this store's last sync time.
    store.lastSyncTime = syncAPI.compareSyncDates(
      order.closed_at,
      store.lastSyncTime
    );
  }

  // Update store location with the latest time orders were synced.
  await store.set({ lastSyncTime: store.lastSyncTime }).save();

  // Log successful operation.
  logger.info("Done. " + orders.length + " orders synced.");
  logger.info("Latest transaction was at " + store.lastSyncTime);
};
