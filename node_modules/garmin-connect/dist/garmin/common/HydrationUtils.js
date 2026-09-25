"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertOuncesToML = exports.convertMLToOunces = void 0;
function convertMLToOunces(valueInML) {
    var conversionFactor = 0.033814;
    var valueInOunces = valueInML * conversionFactor;
    return valueInOunces;
}
exports.convertMLToOunces = convertMLToOunces;
function convertOuncesToML(ounces) {
    var ouncesToMillilitersConversionFactor = 29.5735;
    var milliliters = ounces * ouncesToMillilitersConversionFactor;
    return milliliters;
}
exports.convertOuncesToML = convertOuncesToML;
//# sourceMappingURL=HydrationUtils.js.map