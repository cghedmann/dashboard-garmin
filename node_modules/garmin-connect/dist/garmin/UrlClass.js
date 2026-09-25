"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UrlClass = void 0;
var UrlClass = /** @class */ (function () {
    function UrlClass(domain) {
        if (domain === void 0) { domain = 'garmin.com'; }
        this.domain = domain;
        this.GC_MODERN = "https://connect.".concat(this.domain, "/modern");
        this.GARMIN_SSO_ORIGIN = "https://sso.".concat(this.domain);
        this.GC_API = "https://connectapi.".concat(this.domain);
    }
    Object.defineProperty(UrlClass.prototype, "GARMIN_SSO", {
        get: function () {
            return "".concat(this.GARMIN_SSO_ORIGIN, "/sso");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "GARMIN_SSO_EMBED", {
        get: function () {
            return "".concat(this.GARMIN_SSO_ORIGIN, "/sso/embed");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "BASE_URL", {
        get: function () {
            return "".concat(this.GC_MODERN, "/proxy");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "SIGNIN_URL", {
        get: function () {
            return "".concat(this.GARMIN_SSO, "/signin");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "LOGIN_URL", {
        get: function () {
            return "".concat(this.GARMIN_SSO, "/login");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "OAUTH_URL", {
        get: function () {
            return "".concat(this.GC_API, "/oauth-service/oauth");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "USER_SETTINGS", {
        get: function () {
            return "".concat(this.GC_API, "/userprofile-service/userprofile/user-settings/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "USER_PROFILE", {
        get: function () {
            return "".concat(this.GC_API, "/userprofile-service/socialProfile");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "ACTIVITIES", {
        get: function () {
            return "".concat(this.GC_API, "/activitylist-service/activities/search/activities");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "ACTIVITY", {
        get: function () {
            return "".concat(this.GC_API, "/activity-service/activity/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "STAT_ACTIVITIES", {
        get: function () {
            return "".concat(this.GC_API, "/fitnessstats-service/activity");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DOWNLOAD_ZIP", {
        get: function () {
            return "".concat(this.GC_API, "/download-service/files/activity/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DOWNLOAD_GPX", {
        get: function () {
            return "".concat(this.GC_API, "/download-service/export/gpx/activity/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DOWNLOAD_TCX", {
        get: function () {
            return "".concat(this.GC_API, "/download-service/export/tcx/activity/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DOWNLOAD_KML", {
        get: function () {
            return "".concat(this.GC_API, "/download-service/export/kml/activity/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "UPLOAD", {
        get: function () {
            return "".concat(this.GC_API, "/upload-service/upload/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "IMPORT_DATA", {
        get: function () {
            return "".concat(this.GC_API, "/modern/import-data");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DAILY_STEPS", {
        get: function () {
            return "".concat(this.GC_API, "/usersummary-service/stats/steps/daily/");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DAILY_SLEEP", {
        get: function () {
            return "".concat(this.GC_API, "/sleep-service/sleep/dailySleepData");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DAILY_WEIGHT", {
        get: function () {
            return "".concat(this.GC_API, "/weight-service/weight/dayview");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "UPDATE_WEIGHT", {
        get: function () {
            return "".concat(this.GC_API, "/weight-service/user-weight");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DAILY_HYDRATION", {
        get: function () {
            return "".concat(this.GC_API, "/usersummary-service/usersummary/hydration/allData");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "HYDRATION_LOG", {
        get: function () {
            return "".concat(this.GC_API, "/usersummary-service/usersummary/hydration/log");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "GOLF_SCORECARD_SUMMARY", {
        get: function () {
            return "".concat(this.GC_API, "/gcs-golfcommunity/api/v2/scorecard/summary");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "GOLF_SCORECARD_DETAIL", {
        get: function () {
            return "".concat(this.GC_API, "/gcs-golfcommunity/api/v2/scorecard/detail");
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(UrlClass.prototype, "DAILY_HEART_RATE", {
        get: function () {
            return "".concat(this.GC_API, "/wellness-service/wellness/dailyHeartRate");
        },
        enumerable: false,
        configurable: true
    });
    UrlClass.prototype.WORKOUT = function (id) {
        if (id) {
            return "".concat(this.GC_API, "/workout-service/workout/").concat(id);
        }
        return "".concat(this.GC_API, "/workout-service/workout");
    };
    Object.defineProperty(UrlClass.prototype, "WORKOUTS", {
        get: function () {
            return "".concat(this.GC_API, "/workout-service/workouts");
        },
        enumerable: false,
        configurable: true
    });
    return UrlClass;
}());
exports.UrlClass = UrlClass;
//# sourceMappingURL=UrlClass.js.map