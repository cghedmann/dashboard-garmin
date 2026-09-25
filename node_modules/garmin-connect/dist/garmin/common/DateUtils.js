"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocalTimestamp = exports.calculateTimeDifference = exports.toDateString = void 0;
function toDateString(date) {
    var offset = date.getTimezoneOffset();
    var offsetDate = new Date(date.getTime() - offset * 60 * 1000);
    var dateString = offsetDate.toISOString().split('T')[0];
    return dateString;
}
exports.toDateString = toDateString;
function calculateTimeDifference(sleepStartTimestampGMT, sleepEndTimestampGMT) {
    // Calculate time difference in seconds
    var timeDifferenceInSeconds = (sleepEndTimestampGMT - sleepStartTimestampGMT) / 1000;
    // Convert time difference to hours and minutes
    var hours = Math.floor(timeDifferenceInSeconds / 3600);
    var minutes = Math.floor((timeDifferenceInSeconds % 3600) / 60);
    return {
        hours: hours,
        minutes: minutes
    };
}
exports.calculateTimeDifference = calculateTimeDifference;
function getLocalTimestamp(date, timezone) {
    // Get the current local date timestamp in ISO format
    var localTimestampISO = date.toISOString().substring(0, 23);
    // Convert the ISO timestamp to local timezone while maintaining the same format
    var localTimestamp = new Date(localTimestampISO).toLocaleString('en-US', {
        timeZone: timezone,
        hour12: false
    });
    // Format the local timestamp as `YYYY-MM-DDTHH:MM:SS.SSS`
    var formattedLocalTimestamp = new Date(localTimestamp)
        .toISOString()
        .substring(0, 23);
    return formattedLocalTimestamp;
}
exports.getLocalTimestamp = getLocalTimestamp;
//# sourceMappingURL=DateUtils.js.map