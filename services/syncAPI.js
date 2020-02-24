/* * */
/* * */
/* * * * * */
/* SYNC API */
/* * */
/* * */

/* * */
/* IMPORTS */
const config = require("config");
const logger = require("./logger");
const squareAPI = require("../services/squareAPI");
const { Transaction } = require("../models/Transaction");

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
    body: squareAPI.setRequestBody(squareLocationID, lastSyncTime)
  };

  // Perform the request to the Square API
  // and return response to the caller
  return await squareAPI
    .requestSquareAPI(params, "orders")
    .then(orders => {
      return orders;
    })
    .catch(error => {
      return logger.error(
        "syncAPI.getOrdersFromSquare()",
        "An error occured while getting orders from Square.",
        error,
        []
      );
    });
};

/* * */
/* This function formats an order from Square into the Transaction model. */
/* For this to happen, it is necessary to extract the payment methods, */
/* the line items purchased and the customer details, if there are any.  */
exports.formatOrderIntoTransaction = async order => {
  // Get order items
  // NOTE: This must be outside the Transaction declaration
  // because the print flag in the POS is an item just like any other.
  // If present, this item must be extracted from the order's line_items
  // and the print flag must be set to true.
  const lineItems = getOrderItems(order.line_items);

  // Initiate a new instance of Transaction
  // and format order details according to object model
  await new Transaction({
    // Order ID is the same for debugging purposes
    order_id: order.id,
    // Location ID is the same for debugging purposes
    location_id: order.location_id,
    // The moment in time the order was paid
    closed_at: order.closed_at,
    // Check if order has associated customer details
    customer: await getOrderCustomer(order.tenders),
    // Get order payment methods
    payment_methods: getOrderPaymentMethods(order.tenders),
    // Format order items
    line_items: lineItems.items,
    // Check if document is to be printed or not
    should_print: lineItems.printFlag
  })
    // Save the transaction to the database
    .save();
};

/* * */
/* An order can be payed with several methods, */
/* and Square defines an array of tenders for this purpose. */
/* This function extracts the tenders[i].type from each order object */
/* simplifying it into an array of payment methods. */
const getOrderPaymentMethods = tenders => {
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
/* NOTE about gross_price being divided by 100: */
/* * In Vendus, price is of type "float", */
/* * while in Square, price is of type "Integer", */
/* * therefore it must be divided by 100. */
/* NOTE about tax_id: */
/* * Only one tax_id is possible to apply to each line item, */
/* * according to the Portuguese Legislation, */
/* * and since the Square API defines an array of "taxes" */
/* * possible for each line item, only the array's first value will be used. */
const getOrderItems = lineItems => {
  // Initiate temporary items storage array
  var items = [];
  // Initiate temporary print flag
  var printFlag = false;

  // For each line item
  for (const item of lineItems) {
    // Check if it is a print instruction
    if (item.catalog_object_id === config.get("settings.print-item-id")) {
      // If it is, set the flag
      printFlag = true;
      // and skip item creation
      continue;
    }

    // If it is a normal item,
    // format it and save it to the array
    items.push({
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
        )
    });
  }
  // Return formated items array to the caller,
  // as well as the print flag, wrapped in a new object
  return { items: items, printFlag: printFlag };
};

/* * */
/* Returns the tax_id based on respective tax percentage. */
/* Default value is a global setting. */
const getTaxTier = taxPercentage => {
  switch (taxPercentage) {
    case "6":
      return "RED";
    case "13":
      return "INT";
    case "23":
      return "NOR";

    default:
      return config.get("settings.default-tax-id");
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
const getOrderCustomer = async tenders => {
  // For each tender
  for (const tender of tenders) {
    // find the first available customer_id
    if (tender.customer_id) {
      // and request Square API for it's details
      // Set request params
      const params = {
        method: "GET",
        url: squareAPI.setAPIEndpoint("customers/" + tender.customer_id),
        headers: squareAPI.setRequestHeaders()
      };

      // Return result to the caller
      return await squareAPI
        .requestSquareAPI(params, "customer")
        .then(customer => {
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
              customer.email_address ? customer.email_address : ""
          };
        })
        .catch(error => {
          return logger.error(
            "syncAPI.getOrderCustomer()",
            "An error occured while getting customer details.",
            error,
            {}
          );
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
