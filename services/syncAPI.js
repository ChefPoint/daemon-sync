"use strict";

/* * * * * */
/* SYNC API */
/* * */

/* * */
/* IMPORTS */
const _ = require("lodash");
const config = require("config");
const logger = require("./logger");
const got = require("got");
const moment = require("moment");
const squareAPI = require("../services/squareAPI");
const spreadsheetAPI = require("../services/spreadsheetAPI");
const Transaction = require("../models/Transaction");

/* * */
/* This function requests the Square API for new orders. */
/* It prepares the request parameters, performs the request */
/* and return the orders array to it's caller. */
exports.getOrdersFromSquare = async (squareLocationID, lastSyncTime) => {
  // Set request parameters
  const params = {
    method: "POST",
    url: squareAPI.setAPIEndpoint("orders/search"),
    headers: squareAPI.setRequestHeaders(),
    body: squareAPI.setRequestBody(squareLocationID, lastSyncTime),
    responseType: "json",
  };

  return got(params)
    .then(({ body }) => {
      return body.orders;
    })
    .catch((error) => {
      logger("syncAPI.getOrdersFromSquare()");
      logger("An error occured while getting orders from Square.");
      logger(error);
      return [];
    });

  // Perform the request to the Square API
  // and return response to the caller
  return await squareAPI
    .requestSquareAPI(params, "orders")
    .then((orders) => {
      return orders;
    })
    .catch((error) => {
      logger("syncAPI.getOrdersFromSquare()");
      logger("An error occured while getting orders from Square.");
      logger(error);
      return [];
    });
};

/* * */
/* This function formats an order from Square into the Transaction model. */
/* For this to happen, it is necessary to extract the payment methods, */
/* the line items purchased and the customer details, if there are any.  */
exports.formatOrderIntoTransaction = async (order, store) => {
  /* * getOrderItems()
   * This must be outside the Transaction declaration
   * because the print flag in the POS is an item just like any other.
   * If present, this item must be extracted from the order's line_items
   * and the print flag must be set to true.
   */
  const lineItems = getOrderItems(order.line_items);

  /* * getOrderCustomer()
   * This must be outside the Transaction declaration
   * because the order might contain special MenuTP items.
   * Since those items are published to the special MenuTP spreadsheet,
   * and since they must contain the customer TP Badge ID, then the customer
   * details must be retrieved in advance.
   */
  const customerDetails = await getOrderCustomer(order.tenders);

  /* * getOrderPaymentMethods()
   * This must be outside the Transaction declaration
   * because the order might contain special MenuTP items.
   * Since those items are published to the special MenuTP spreadsheet,
   * and since they must contain the customer TP Badge ID, then the customer
   * details must be retrieved in advance.
   */
  const paymentMethods = getOrderPaymentMethods(order.tenders);

  //

  /* * lineItems.menuTPItems
   * If lineItems.menuTPItems contains objects,
   * then publish them to the MenuTP spreadsheet.
   */
  if (!_.isEmpty(lineItems.menuTPItems)) {
    // Send items to the MenuTP spreadsheet
    try {
      await spreadsheetAPI.addNewRow(
        config.get("menuTP.document-id"),
        config.get("menuTP.sheet-id"),
        {
          // The shop location
          Location: store.shortName,
          // The transaction date formated so GSheets understands
          Date: moment(order.closed_at).format("[=DATE(]YYYY[,]MM[,]DD[)]"),
          // The transaction time formated so GSheets understands
          Time: moment(order.closed_at).format("[=TIME(]HH[,]mm[,0)]"),
          // The customer TP Badge ID
          BadgeID: customerDetails ? customerDetails.name : "not-available",
          // The items themselves
          ...lineItems.menuTPItems,
        }
      );
    } catch (err) {
      console.log(err);
    }
  }

  /* * lineItems.reservationItems
   * If lineItems.reservationItems contains objects,
   * then publish them to the Reservations spreadsheet.
   */
  if (!_.isEmpty(lineItems.reservationItems)) {
    // Send items to the Reservations spreadsheet
    try {
      await spreadsheetAPI.addNewRow(
        config.get("reservations.document-id"),
        config.get("reservations.sheet-id"),
        {
          // The order ID
          orderID: order.id,
          // The shop location
          location: store.shortName,
          // The customer TP Badge ID
          customerName: customerDetails
            ? customerDetails.name
            : "not-available",
          // The reservation (transaction) date formated so GSheets understands
          reservationDate: moment(order.closed_at).format(
            "[=DATE(]YYYY[,]MM[,]DD[)]"
          ),
          // The pickup date formated so GSheets understands
          pickupDate: moment(order.closed_at)
            .add(1, "day")
            .format("[=DATE(]YYYY[,]MM[,]DD[)]"),
          // The items themselves
          ...lineItems.reservationItems,
        }
      );
    } catch (err) {
      console.log(err);
    }
  }

  /* * Prevent skipped-customers from creating invoices.
   * Only create a transaction if the order contains items to be invoiced.
   * Otherwise the process module throws an error because it can't accept empty transactions.
   */
  for (const sc of config.get("skipped-customers")) {
    if (customerDetails && customerDetails.fiscal_id == sc.fiscal_id) {
      logger("> Customer skipped: " + sc.name + " (" + sc.fiscal_id + ")");
      return;
    }
  }

  /* * lineItems.invoicedItems.lenght
   * Only create a transaction if the order contains items to be invoiced.
   * Otherwise the process module throws an error because it can't accept empty transactions.
   */
  if (lineItems.invoicedItems.length) {
    // Initiate a new instance of Transaction
    // and format order details according to object model
    await new Transaction({
      // Order ID is the same for debugging purposes
      order_id: order.id,
      // Location name for debugging purposes
      locationShortName: store.shortName,
      // Location squareLocationID is the same for debugging purposes
      squareLocationID: order.location_id,
      // Location vendusRegisterID for dameon-proccess independence
      vendusRegisterID: store.vendusRegisterID,
      // The moment in time the order was paid
      closed_at: order.closed_at,
      // Get order payment methods
      payment_methods: paymentMethods,
      // Format order items
      line_items: lineItems.invoicedItems,
      // Check if order has associated customer details
      customer: customerDetails,
      // Check if document is to be printed or not
      should_print: lineItems.printFlag,
    })
      // Save the transaction to the database
      .save();
  }
};

/* * */
/* An order can be payed with several methods, */
/* and Square defines an array of tenders for this purpose. */
/* This function extracts the tenders[i].type from each order object */
/* simplifying it into an array of payment methods. */
const getOrderPaymentMethods = (tenders) => {
  // Initiate temporary storage array
  const paymentMethods = [];
  // For each tender
  for (const tender of tenders) {
    // save the used payment method to paymentMethods[]
    paymentMethods.push(tender.type);
  }
  // Return the details to the caller
  return paymentMethods;
};

/* * */
/* For the given line items, produce an array of items */
/* according to the format required by the Vendus API. */
/* NOTE about printFlag: */
/* * In the POS, the print instruction is a normal item. */
/* * That item, if present, must be read and removed from the transaction */
/* * and it's presence must set the should_print flag to true, */
/* * so that at process time the invoice ID can be saved to the print queue. */
/* NOTE about menuTPItems: */
/* * --------Explanation needed!--------- */
/* * --------Explanation needed!--------- */
/* NOTE about reservationItems: */
/* * --------Explanation needed!--------- */
/* * --------Explanation needed!--------- */
/* NOTE about gross_price being divided by 100: */
/* * In Vendus, price is of type "float", */
/* * while in Square, price is of type "Integer", */
/* * therefore it must be divided by 100. */
/* NOTE about tax_id: */
/* * Only one tax_id is possible to apply to each line item, */
/* * according to the Portuguese Legislation, */
/* * and since the Square API defines an array of "taxes" */
/* * possible for each line item, only the array's first value will be used. */
const getOrderItems = (lineItems) => {
  // Initiate temporary Print flag
  let printFlag = false;
  // Initiate temporary MenuTP items object
  let menuTPItems = {};
  // Initiate temporary Reservation items
  let reservationItems = {};
  // Initiate temporary Invoiced items storage array
  let invoicedItems = [];

  // For each line item
  for (const item of lineItems) {
    // Initiate Skip item creation variable
    // Explanation needed!
    let skipItemCreation = false;

    // A.
    // Check if it is a print instruction
    if (item.catalog_object_id === config.get("general.print-item-id")) {
      // If it is, set the flag
      printFlag = true;
      // and skip item creation
      skipItemCreation = true;
    }

    // B.
    // Check if it is a special MenuTP item
    for (const tp of config.get("menuTP.items")) {
      if (item.catalog_object_id === tp.reference) {
        // If it is, set its key and quantity
        if (menuTPItems[tp.key]) menuTPItems[tp.key] += Number(item.quantity);
        else menuTPItems[tp.key] = Number(item.quantity);
        // and skip item creation
        skipItemCreation = true;
        break;
      }
    }

    // C.
    // Check if it is a reservation
    for (const rv of config.get("reservations.items")) {
      if (item.catalog_object_id === rv.reference) {
        // If it is, set its key and quantity
        if (reservationItems[rv.key])
          reservationItems[rv.key] += Number(item.quantity);
        else reservationItems[rv.key] = Number(item.quantity);
        break;
      }
    }

    // Skip item creation
    // This declaration must be outside of the above for loops
    // because it is the main "order.lineItems" loop that must be skipped.
    if (skipItemCreation) continue;

    // D.
    // If item creation should not be skipped,
    // format the item and save it to the array
    invoicedItems.push({
      reference:
        // Reference for debugging purposes
        item.catalog_object_id || "none-available",
      title:
        // Item title is constructed out of it's name and it's variation name
        item.name +
        // Square appends "Regular" to simple items without variation,
        // so that is removed here if "Regular" is found.
        (item.variation_name != "Regular" ? " " + item.variation_name : ""),
      qty:
        // Item quantity
        item.quantity,
      gross_price:
        // In Square, price is an integer, while in Vendus price is a float.
        item.base_price_money.amount / 100,
      tax_id:
        // If line item has valid taxes array, only get it's first value.
        getTaxTier(
          item.taxes && item.taxes.length ? item.taxes[0].percentage : ""
        ),
    });
  }
  // Return formated items array to the caller,
  // as well as the print flag, wrapped in a new object
  return { printFlag, menuTPItems, reservationItems, invoicedItems };
};

/* * */
/* Returns the tax_id based on respective tax percentage. */
/* Default value is a global setting. */
const getTaxTier = (taxPercentage) => {
  switch (taxPercentage) {
    case "6":
      return "RED";
    case "13":
      return "INT";
    case "23":
      return "NOR";

    default:
      return config.get("general.default-tax-id");
  }
};

/* * */
/* If there is a customer associated with the transaction */
/* this function requests the Square API for its details, */
/* since for each order only the customer_id is available. */
/* It then formats it and returns the object to the caller. */
/* NOTE about customer_id: */
/* * Only one customer_id is possible to apply to each invoice, */
/* * according to Portuguese Legislation. Since the Square API */
/* * defines an array of "tenders" possible for each transaction, */
/* * the program will iterate through the array */
/* * and use the first found value. */
const getOrderCustomer = async (tenders) => {
  // For each tender
  for (const tender of tenders) {
    // find the first available customer_id
    if (tender.customer_id) {
      // and request Square API for it's details
      // Set request params
      const params = {
        method: "GET",
        url: squareAPI.setAPIEndpoint("customers/" + tender.customer_id),
        headers: squareAPI.setRequestHeaders(),
        responseType: "json",
      };

      return got(params)
        .then(({ body }) => {
          // Return the formated info to the caller
          const customer = body.customer;

          // Return the formated info to the caller
          return {
            fiscal_id:
              // Remove white spaces
              customer.reference_id
                ? customer.reference_id.replace(/\s+/g, "")
                : null,
            name:
              // Check if name is present, since it is not mandatory
              (customer.given_name ? customer.given_name : "") +
              (customer.family_name ? " " + customer.family_name : ""),
            email:
              // Check if email is present, since it is not mandatory
              customer.email_address ? customer.email_address : "",
          };
        })
        .catch((error) => {
          logger("syncAPI.getOrderCustomer()");
          logger("An error occured while getting customer details.");
          logger(error);
          return {};
        });

      // Return result to the caller
      return await squareAPI
        .requestSquareAPI(params, "customer")
        .then((customer) => {
          // Return the formated info to the caller
          return {
            fiscal_id:
              // Remove white spaces
              customer.reference_id
                ? customer.reference_id.replace(/\s+/g, "")
                : null,
            name:
              // Check if name is present, since it is not mandatory
              (customer.given_name ? customer.given_name : "") +
              (customer.family_name ? " " + customer.family_name : ""),
            email:
              // Check if email is present, since it is not mandatory
              customer.email_address ? customer.email_address : "",
          };
        })
        .catch((error) => {
          logger("syncAPI.getOrderCustomer()");
          logger("An error occured while getting customer details.");
          logger(error);
          return {};
        });
    }
  }
};

/* * */
/* This function compares, for each order, it's closed_at date value */
/* with the last time order were synced. The most recent value of */
/* thisOrderDate or lastTimeOrdersWereSynced is return to the caller. */
exports.compareSyncDates = (thisOrderDate, lastTimeOrdersWereSynced) => {
  // Transform strings into Date() objects
  thisOrderDate = new Date(thisOrderDate);
  lastTimeOrdersWereSynced = new Date(lastTimeOrdersWereSynced);

  // Update latestTransaction with the most recent transaction received
  if (thisOrderDate > lastTimeOrdersWereSynced) {
    lastTimeOrdersWereSynced = new Date(
      // Add 1 second to the date,
      // so that this order does not get processed twice
      thisOrderDate.setMilliseconds(+1000)
    );
  }

  // Return a string to the caller
  return lastTimeOrdersWereSynced.toISOString();
};
