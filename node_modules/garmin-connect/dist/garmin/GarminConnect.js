"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Event = void 0;
var app_root_path_1 = __importDefault(require("app-root-path"));
var form_data_1 = __importDefault(require("form-data"));
var lodash_1 = __importDefault(require("lodash"));
var luxon_1 = require("luxon");
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var HttpClient_1 = require("../common/HttpClient");
var utils_1 = require("../utils");
var UrlClass_1 = require("./UrlClass");
var types_1 = require("./types");
var Running_1 = __importDefault(require("./workouts/Running"));
var DateUtils_1 = require("./common/DateUtils");
var WeightUtils_1 = require("./common/WeightUtils");
var HydrationUtils_1 = require("./common/HydrationUtils");
var config = undefined;
try {
    config = app_root_path_1.default.require('/garmin.config.json');
}
catch (e) {
    // Do nothing
}
var Event;
(function (Event) {
    Event["sessionChange"] = "sessionChange";
})(Event = exports.Event || (exports.Event = {}));
var GarminConnect = /** @class */ (function () {
    // private oauth1: OAuth;
    function GarminConnect(credentials, domain) {
        if (credentials === void 0) { credentials = config; }
        if (domain === void 0) { domain = 'garmin.com'; }
        if (!credentials) {
            throw new Error('Missing credentials');
        }
        this.credentials = credentials;
        this.url = new UrlClass_1.UrlClass(domain);
        this.client = new HttpClient_1.HttpClient(this.url);
        this._userHash = undefined;
        this.listeners = {};
    }
    GarminConnect.prototype.login = function (username, password) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (username && password) {
                            this.credentials.username = username;
                            this.credentials.password = password;
                        }
                        return [4 /*yield*/, this.client.login(this.credentials.username, this.credentials.password)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, this];
                }
            });
        });
    };
    GarminConnect.prototype.exportTokenToFile = function (dirPath) {
        if (!(0, utils_1.checkIsDirectory)(dirPath)) {
            (0, utils_1.createDirectory)(dirPath);
        }
        // save oauth1 to json
        if (this.client.oauth1Token) {
            (0, utils_1.writeToFile)(path.join(dirPath, 'oauth1_token.json'), JSON.stringify(this.client.oauth1Token));
        }
        if (this.client.oauth2Token) {
            (0, utils_1.writeToFile)(path.join(dirPath, 'oauth2_token.json'), JSON.stringify(this.client.oauth2Token));
        }
    };
    GarminConnect.prototype.loadTokenByFile = function (dirPath) {
        if (!(0, utils_1.checkIsDirectory)(dirPath)) {
            throw new Error('loadTokenByFile: Directory not found: ' + dirPath);
        }
        var oauth1Data = fs.readFileSync(path.join(dirPath, 'oauth1_token.json'));
        var oauth1 = JSON.parse(oauth1Data);
        this.client.oauth1Token = oauth1;
        var oauth2Data = fs.readFileSync(path.join(dirPath, 'oauth2_token.json'));
        var oauth2 = JSON.parse(oauth2Data);
        this.client.oauth2Token = oauth2;
    };
    GarminConnect.prototype.exportToken = function () {
        if (!this.client.oauth1Token || !this.client.oauth2Token) {
            throw new Error('exportToken: Token not found');
        }
        return {
            oauth1: this.client.oauth1Token,
            oauth2: this.client.oauth2Token
        };
    };
    // from db or localstorage etc
    GarminConnect.prototype.loadToken = function (oauth1, oauth2) {
        this.client.oauth1Token = oauth1;
        this.client.oauth2Token = oauth2;
    };
    GarminConnect.prototype.getUserSettings = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.client.get(this.url.USER_SETTINGS)];
            });
        });
    };
    GarminConnect.prototype.getUserProfile = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.client.get(this.url.USER_PROFILE)];
            });
        });
    };
    GarminConnect.prototype.getActivities = function (start, limit, activityType, subActivityType) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.client.get(this.url.ACTIVITIES, {
                        params: { start: start, limit: limit, activityType: activityType, subActivityType: subActivityType }
                    })];
            });
        });
    };
    GarminConnect.prototype.getActivity = function (activity) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!activity.activityId)
                    throw new Error('Missing activityId');
                return [2 /*return*/, this.client.get(this.url.ACTIVITY + activity.activityId)];
            });
        });
    };
    GarminConnect.prototype.countActivities = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.client.get(this.url.STAT_ACTIVITIES, {
                        params: {
                            aggregation: 'lifetime',
                            startDate: '1970-01-01',
                            endDate: luxon_1.DateTime.now().toFormat('yyyy-MM-dd'),
                            metric: 'duration'
                        }
                    })];
            });
        });
    };
    GarminConnect.prototype.downloadOriginalActivityData = function (activity, dir, type) {
        if (type === void 0) { type = 'zip'; }
        return __awaiter(this, void 0, void 0, function () {
            var fileBuffer;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!activity.activityId)
                            throw new Error('Missing activityId');
                        if (!(0, utils_1.checkIsDirectory)(dir)) {
                            (0, utils_1.createDirectory)(dir);
                        }
                        if (!(type === 'tcx')) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.client.get(this.url.DOWNLOAD_TCX + activity.activityId)];
                    case 1:
                        fileBuffer = _a.sent();
                        return [3 /*break*/, 9];
                    case 2:
                        if (!(type === 'gpx')) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.client.get(this.url.DOWNLOAD_GPX + activity.activityId)];
                    case 3:
                        fileBuffer = _a.sent();
                        return [3 /*break*/, 9];
                    case 4:
                        if (!(type === 'kml')) return [3 /*break*/, 6];
                        return [4 /*yield*/, this.client.get(this.url.DOWNLOAD_KML + activity.activityId)];
                    case 5:
                        fileBuffer = _a.sent();
                        return [3 /*break*/, 9];
                    case 6:
                        if (!(type === 'zip')) return [3 /*break*/, 8];
                        return [4 /*yield*/, this.client.get(this.url.DOWNLOAD_ZIP + activity.activityId, {
                                responseType: 'arraybuffer'
                            })];
                    case 7:
                        fileBuffer = _a.sent();
                        return [3 /*break*/, 9];
                    case 8: throw new Error('downloadOriginalActivityData - Invalid type: ' + type);
                    case 9:
                        (0, utils_1.writeToFile)(path.join(dir, "".concat(activity.activityId, ".").concat(type)), fileBuffer);
                        return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.uploadActivity = function (file, format) {
        var _a;
        if (format === void 0) { format = 'fit'; }
        return __awaiter(this, void 0, void 0, function () {
            var detectedFormat, fileBuffer, form, response;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        detectedFormat = (_a = (format || path.extname(file))) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                        if (!lodash_1.default.includes(types_1.UploadFileType, detectedFormat)) {
                            throw new Error('uploadActivity - Invalid format: ' + format);
                        }
                        fileBuffer = fs.createReadStream(file);
                        form = new form_data_1.default();
                        form.append('userfile', fileBuffer);
                        return [4 /*yield*/, this.client.post(this.url.UPLOAD + '.' + format, form, {
                                headers: {
                                    'Content-Type': form.getHeaders()['content-type']
                                }
                            })];
                    case 1:
                        response = _b.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    GarminConnect.prototype.deleteActivity = function (activity) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!activity.activityId)
                            throw new Error('Missing activityId');
                        return [4 /*yield*/, this.client.delete(this.url.ACTIVITY + activity.activityId)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getWorkouts = function (start, limit) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.client.get(this.url.WORKOUTS, {
                        params: {
                            start: start,
                            limit: limit
                        }
                    })];
            });
        });
    };
    GarminConnect.prototype.getWorkoutDetail = function (workout) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!workout.workoutId)
                    throw new Error('Missing workoutId');
                return [2 /*return*/, this.client.get(this.url.WORKOUT(workout.workoutId))];
            });
        });
    };
    GarminConnect.prototype.addWorkout = function (workout) {
        return __awaiter(this, void 0, void 0, function () {
            var data, newWorkout;
            return __generator(this, function (_a) {
                if (!workout)
                    throw new Error('Missing workout');
                if (workout instanceof Running_1.default) {
                    if (workout.isValid()) {
                        data = __assign({}, workout.toJson());
                        if (!data.description) {
                            data.description = 'Added by garmin-connect for Node.js';
                        }
                        return [2 /*return*/, this.client.post(this.url.WORKOUT(), data)];
                    }
                }
                newWorkout = lodash_1.default.omit(workout, [
                    'workoutId',
                    'ownerId',
                    'updatedDate',
                    'createdDate',
                    'author'
                ]);
                if (!newWorkout.description) {
                    newWorkout.description = 'Added by garmin-connect for Node.js';
                }
                // console.log('addWorkout - newWorkout:', newWorkout)
                return [2 /*return*/, this.client.post(this.url.WORKOUT(), newWorkout)];
            });
        });
    };
    GarminConnect.prototype.addRunningWorkout = function (name, meters, description) {
        return __awaiter(this, void 0, void 0, function () {
            var running;
            return __generator(this, function (_a) {
                running = new Running_1.default();
                running.name = name;
                running.distance = meters;
                running.description = description;
                return [2 /*return*/, this.addWorkout(running)];
            });
        });
    };
    GarminConnect.prototype.deleteWorkout = function (workout) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (!workout.workoutId)
                    throw new Error('Missing workout');
                return [2 /*return*/, this.client.delete(this.url.WORKOUT(workout.workoutId))];
            });
        });
    };
    GarminConnect.prototype.getSteps = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var dateString, days, dayStats;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        dateString = (0, DateUtils_1.toDateString)(date);
                        return [4 /*yield*/, this.client.get("".concat(this.url.DAILY_STEPS).concat(dateString, "/").concat(dateString))];
                    case 1:
                        days = _a.sent();
                        dayStats = days.find(function (_a) {
                            var calendarDate = _a.calendarDate;
                            return calendarDate === dateString;
                        });
                        if (!dayStats) {
                            throw new Error("Can't find daily steps for this date.");
                        }
                        return [2 /*return*/, dayStats.totalSteps];
                }
            });
        });
    };
    GarminConnect.prototype.getSleepData = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var dateString, sleepData, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        dateString = (0, DateUtils_1.toDateString)(date);
                        return [4 /*yield*/, this.client.get("".concat(this.url.DAILY_SLEEP), { params: { date: dateString } })];
                    case 1:
                        sleepData = _a.sent();
                        if (!sleepData) {
                            throw new Error('Invalid or empty sleep data response.');
                        }
                        return [2 /*return*/, sleepData];
                    case 2:
                        error_1 = _a.sent();
                        throw new Error("Error in getSleepData: ".concat(error_1.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getSleepDuration = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var sleepData, sleepStartTimestampGMT, sleepEndTimestampGMT, _a, hours, minutes, error_2;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getSleepData(date)];
                    case 1:
                        sleepData = _b.sent();
                        if (!sleepData ||
                            !sleepData.dailySleepDTO ||
                            sleepData.dailySleepDTO.sleepStartTimestampGMT === undefined ||
                            sleepData.dailySleepDTO.sleepEndTimestampGMT === undefined) {
                            throw new Error('Invalid or missing sleep data for the specified date.');
                        }
                        sleepStartTimestampGMT = sleepData.dailySleepDTO.sleepStartTimestampGMT;
                        sleepEndTimestampGMT = sleepData.dailySleepDTO.sleepEndTimestampGMT;
                        _a = (0, DateUtils_1.calculateTimeDifference)(sleepStartTimestampGMT, sleepEndTimestampGMT), hours = _a.hours, minutes = _a.minutes;
                        return [2 /*return*/, {
                                hours: hours,
                                minutes: minutes
                            }];
                    case 2:
                        error_2 = _b.sent();
                        throw new Error("Error in getSleepDuration: ".concat(error_2.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getDailyWeightData = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var dateString, weightData, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        dateString = (0, DateUtils_1.toDateString)(date);
                        return [4 /*yield*/, this.client.get("".concat(this.url.DAILY_WEIGHT, "/").concat(dateString))];
                    case 1:
                        weightData = _a.sent();
                        if (!weightData) {
                            throw new Error('Invalid or empty weight data response.');
                        }
                        return [2 /*return*/, weightData];
                    case 2:
                        error_3 = _a.sent();
                        throw new Error("Error in getDailyWeightData: ".concat(error_3.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getDailyWeightInPounds = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var weightData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getDailyWeightData(date)];
                    case 1:
                        weightData = _a.sent();
                        if (weightData.totalAverage &&
                            typeof weightData.totalAverage.weight === 'number') {
                            return [2 /*return*/, (0, WeightUtils_1.gramsToPounds)(weightData.totalAverage.weight)];
                        }
                        else {
                            throw new Error("Can't find valid daily weight for this date.");
                        }
                        return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getDailyHydration = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var dateString, hydrationData, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        dateString = (0, DateUtils_1.toDateString)(date);
                        return [4 /*yield*/, this.client.get("".concat(this.url.DAILY_HYDRATION, "/").concat(dateString))];
                    case 1:
                        hydrationData = _a.sent();
                        if (!hydrationData || !hydrationData.valueInML) {
                            throw new Error('Invalid or empty hydration data response.');
                        }
                        return [2 /*return*/, (0, HydrationUtils_1.convertMLToOunces)(hydrationData.valueInML)];
                    case 2:
                        error_4 = _a.sent();
                        throw new Error("Error in getDailyHydration: ".concat(error_4.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.updateWeight = function (date, lbs, timezone) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var weightData, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.client.post("".concat(this.url.UPDATE_WEIGHT), {
                                dateTimestamp: (0, DateUtils_1.getLocalTimestamp)(date, timezone),
                                gmtTimestamp: date.toISOString().substring(0, 23),
                                unitKey: 'lbs',
                                value: lbs
                            })];
                    case 1:
                        weightData = _a.sent();
                        return [2 /*return*/, weightData];
                    case 2:
                        error_5 = _a.sent();
                        throw new Error("Error in updateWeight: ".concat(error_5.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.updateHydrationLogOunces = function (date, valueInOz) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var dateString, hydrationData, _a, _b, _c, error_6;
            var _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 3, , 4]);
                        dateString = (0, DateUtils_1.toDateString)(date);
                        _b = (_a = this.client).put;
                        _c = ["".concat(this.url.HYDRATION_LOG)];
                        _d = {
                            calendarDate: dateString,
                            valueInML: (0, HydrationUtils_1.convertOuncesToML)(valueInOz)
                        };
                        return [4 /*yield*/, this.getUserProfile()];
                    case 1: return [4 /*yield*/, _b.apply(_a, _c.concat([(_d.userProfileId = (_e.sent()).profileId,
                                _d.timestampLocal = date.toISOString().substring(0, 23),
                                _d)]))];
                    case 2:
                        hydrationData = _e.sent();
                        return [2 /*return*/, hydrationData];
                    case 3:
                        error_6 = _e.sent();
                        throw new Error("Error in updateHydrationLogOunces: ".concat(error_6.message));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getGolfSummary = function () {
        return __awaiter(this, void 0, void 0, function () {
            var golfSummary, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.client.get("".concat(this.url.GOLF_SCORECARD_SUMMARY))];
                    case 1:
                        golfSummary = _a.sent();
                        if (!golfSummary) {
                            throw new Error('Invalid or empty golf summary data response.');
                        }
                        return [2 /*return*/, golfSummary];
                    case 2:
                        error_7 = _a.sent();
                        throw new Error("Error in getGolfSummary: ".concat(error_7.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getGolfScorecard = function (scorecardId) {
        return __awaiter(this, void 0, void 0, function () {
            var golfScorecard, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.client.get("".concat(this.url.GOLF_SCORECARD_DETAIL), { params: { 'scorecard-ids': scorecardId } })];
                    case 1:
                        golfScorecard = _a.sent();
                        if (!golfScorecard) {
                            throw new Error('Invalid or empty golf scorecard data response.');
                        }
                        return [2 /*return*/, golfScorecard];
                    case 2:
                        error_8 = _a.sent();
                        throw new Error("Error in getGolfScorecard: ".concat(error_8.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.getHeartRate = function (date) {
        if (date === void 0) { date = new Date(); }
        return __awaiter(this, void 0, void 0, function () {
            var dateString, heartRate, error_9;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        dateString = (0, DateUtils_1.toDateString)(date);
                        return [4 /*yield*/, this.client.get("".concat(this.url.DAILY_HEART_RATE), { params: { date: dateString } })];
                    case 1:
                        heartRate = _a.sent();
                        return [2 /*return*/, heartRate];
                    case 2:
                        error_9 = _a.sent();
                        throw new Error("Error in getHeartRate: ".concat(error_9.message));
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    GarminConnect.prototype.get = function (url, data) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.get(url, data)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    GarminConnect.prototype.post = function (url, data) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.post(url, data, {})];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    GarminConnect.prototype.put = function (url, data) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.put(url, data, {})];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    return GarminConnect;
}());
exports.default = GarminConnect;
//# sourceMappingURL=GarminConnect.js.map