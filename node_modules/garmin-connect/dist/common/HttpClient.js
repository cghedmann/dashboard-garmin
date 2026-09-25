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
exports.HttpClient = void 0;
var axios_1 = __importDefault(require("axios"));
var form_data_1 = __importDefault(require("form-data"));
var lodash_1 = __importDefault(require("lodash"));
var luxon_1 = require("luxon");
var oauth_1_0a_1 = __importDefault(require("oauth-1.0a"));
var qs_1 = __importDefault(require("qs"));
var crypto = require('crypto');
var CSRF_RE = new RegExp('name="_csrf"\\s+value="(.+?)"');
var TICKET_RE = new RegExp('ticket=([^"]+)"');
var ACCOUNT_LOCKED_RE = new RegExp('var statuss*=s*"([^"]*)"');
var PAGE_TITLE_RE = new RegExp('<title>([^<]*)</title>');
var USER_AGENT_CONNECTMOBILE = 'com.garmin.android.apps.connectmobile';
var USER_AGENT_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
var OAUTH_CONSUMER_URL = 'https://thegarth.s3.amazonaws.com/oauth_consumer.json';
//  refresh token
var isRefreshing = false;
var refreshSubscribers = [];
var HttpClient = /** @class */ (function () {
    function HttpClient(url) {
        var _this = this;
        this.url = url;
        this.client = axios_1.default.create();
        this.client.interceptors.response.use(function (response) { return response; }, function (error) { return __awaiter(_this, void 0, void 0, function () {
            var originalRequest, token, err_1;
            var _this = this;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        originalRequest = error.config;
                        if (!(((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) === 401 &&
                            !(originalRequest === null || originalRequest === void 0 ? void 0 : originalRequest._retry))) return [3 /*break*/, 6];
                        if (!this.oauth2Token) {
                            return [2 /*return*/];
                        }
                        if (!isRefreshing) return [3 /*break*/, 4];
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, new Promise(function (resolve) {
                                refreshSubscribers.push(function (token) {
                                    resolve(token);
                                });
                            })];
                    case 2:
                        token = _b.sent();
                        originalRequest.headers.Authorization = "Bearer ".concat(token);
                        return [2 /*return*/, this.client(originalRequest)];
                    case 3:
                        err_1 = _b.sent();
                        console.log('err:', err_1);
                        return [2 /*return*/, Promise.reject(err_1)];
                    case 4:
                        originalRequest._retry = true;
                        isRefreshing = true;
                        console.log('interceptors: refreshOauth2Token start');
                        return [4 /*yield*/, this.refreshOauth2Token()];
                    case 5:
                        _b.sent();
                        console.log('interceptors: refreshOauth2Token end');
                        isRefreshing = false;
                        refreshSubscribers.forEach(function (subscriber) {
                            return subscriber(_this.oauth2Token.access_token);
                        });
                        refreshSubscribers = [];
                        originalRequest.headers.Authorization = "Bearer ".concat(this.oauth2Token.access_token);
                        return [2 /*return*/, this.client(originalRequest)];
                    case 6:
                        if (axios_1.default.isAxiosError(error)) {
                            if (error === null || error === void 0 ? void 0 : error.response)
                                this.handleError(error === null || error === void 0 ? void 0 : error.response);
                        }
                        throw error;
                }
            });
        }); });
        this.client.interceptors.request.use(function (config) { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.oauth2Token) {
                    config.headers.Authorization =
                        'Bearer ' + this.oauth2Token.access_token;
                }
                return [2 /*return*/, config];
            });
        }); });
    }
    HttpClient.prototype.fetchOauthConsumer = function () {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, axios_1.default.get(OAUTH_CONSUMER_URL)];
                    case 1:
                        response = _a.sent();
                        this.OAUTH_CONSUMER = {
                            key: response.data.consumer_key,
                            secret: response.data.consumer_secret
                        };
                        return [2 /*return*/];
                }
            });
        });
    };
    HttpClient.prototype.checkTokenVaild = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.oauth2Token) return [3 /*break*/, 2];
                        if (!(this.oauth2Token.expires_at < luxon_1.DateTime.now().toSeconds())) return [3 /*break*/, 2];
                        console.error('Token expired!');
                        return [4 /*yield*/, this.refreshOauth2Token()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    HttpClient.prototype.get = function (url, config) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.get(url, config)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response === null || response === void 0 ? void 0 : response.data];
                }
            });
        });
    };
    HttpClient.prototype.post = function (url, data, config) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.post(url, data, config)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response === null || response === void 0 ? void 0 : response.data];
                }
            });
        });
    };
    HttpClient.prototype.put = function (url, data, config) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.put(url, data, config)];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response === null || response === void 0 ? void 0 : response.data];
                }
            });
        });
    };
    HttpClient.prototype.delete = function (url, config) {
        return __awaiter(this, void 0, void 0, function () {
            var response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.client.post(url, null, __assign(__assign({}, config), { headers: __assign(__assign({}, config === null || config === void 0 ? void 0 : config.headers), { 'X-Http-Method-Override': 'DELETE' }) }))];
                    case 1:
                        response = _a.sent();
                        return [2 /*return*/, response === null || response === void 0 ? void 0 : response.data];
                }
            });
        });
    };
    HttpClient.prototype.setCommonHeader = function (headers) {
        var _this = this;
        lodash_1.default.each(headers, function (headerValue, key) {
            _this.client.defaults.headers.common[key] = headerValue;
        });
    };
    HttpClient.prototype.handleError = function (response) {
        this.handleHttpError(response);
    };
    HttpClient.prototype.handleHttpError = function (response) {
        var status = response.status, statusText = response.statusText, data = response.data;
        var msg = "ERROR: (".concat(status, "), ").concat(statusText, ", ").concat(JSON.stringify(data));
        console.error(msg);
        throw new Error(msg);
    };
    /**
     * Login to Garmin Connect
     * @param username
     * @param password
     * @returns {Promise<HttpClient>}
     */
    HttpClient.prototype.login = function (username, password) {
        return __awaiter(this, void 0, void 0, function () {
            var ticket, oauth1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.fetchOauthConsumer()];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.getLoginTicket(username, password)];
                    case 2:
                        ticket = _a.sent();
                        return [4 /*yield*/, this.getOauth1Token(ticket)];
                    case 3:
                        oauth1 = _a.sent();
                        // TODO: Handle MFA
                        // Step 5: Oauth2
                        return [4 /*yield*/, this.exchange(oauth1)];
                    case 4:
                        // TODO: Handle MFA
                        // Step 5: Oauth2
                        _a.sent();
                        return [2 /*return*/, this];
                }
            });
        });
    };
    HttpClient.prototype.getLoginTicket = function (username, password) {
        return __awaiter(this, void 0, void 0, function () {
            var step1Params, step1Url, step2Params, step2Url, step2Result, csrfRegResult, csrf_token, signinParams, step3Url, step3Form, step3Result, ticketRegResult, ticket;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        step1Params = {
                            clientId: 'GarminConnect',
                            locale: 'en',
                            service: this.url.GC_MODERN
                        };
                        step1Url = "".concat(this.url.GARMIN_SSO_EMBED, "?").concat(qs_1.default.stringify(step1Params));
                        // console.log('login - step1Url:', step1Url);
                        return [4 /*yield*/, this.client.get(step1Url)];
                    case 1:
                        // console.log('login - step1Url:', step1Url);
                        _a.sent();
                        step2Params = {
                            id: 'gauth-widget',
                            embedWidget: true,
                            locale: 'en',
                            gauthHost: this.url.GARMIN_SSO_EMBED
                        };
                        step2Url = "".concat(this.url.SIGNIN_URL, "?").concat(qs_1.default.stringify(step2Params));
                        return [4 /*yield*/, this.get(step2Url)];
                    case 2:
                        step2Result = _a.sent();
                        csrfRegResult = CSRF_RE.exec(step2Result);
                        if (!csrfRegResult) {
                            throw new Error('login - csrf not found');
                        }
                        csrf_token = csrfRegResult[1];
                        signinParams = {
                            id: 'gauth-widget',
                            embedWidget: true,
                            clientId: 'GarminConnect',
                            locale: 'en',
                            gauthHost: this.url.GARMIN_SSO_EMBED,
                            service: this.url.GARMIN_SSO_EMBED,
                            source: this.url.GARMIN_SSO_EMBED,
                            redirectAfterAccountLoginUrl: this.url.GARMIN_SSO_EMBED,
                            redirectAfterAccountCreationUrl: this.url.GARMIN_SSO_EMBED
                        };
                        step3Url = "".concat(this.url.SIGNIN_URL, "?").concat(qs_1.default.stringify(signinParams));
                        step3Form = new form_data_1.default();
                        step3Form.append('username', username);
                        step3Form.append('password', password);
                        step3Form.append('embed', 'true');
                        step3Form.append('_csrf', csrf_token);
                        return [4 /*yield*/, this.post(step3Url, step3Form, {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    Dnt: 1,
                                    Origin: this.url.GARMIN_SSO_ORIGIN,
                                    Referer: this.url.SIGNIN_URL,
                                    'User-Agent': USER_AGENT_BROWSER
                                }
                            })];
                    case 3:
                        step3Result = _a.sent();
                        // console.log('step3Result:', step3Result)
                        this.handleAccountLocked(step3Result);
                        this.handlePageTitle(step3Result);
                        this.handleMFA(step3Result);
                        ticketRegResult = TICKET_RE.exec(step3Result);
                        if (!ticketRegResult) {
                            throw new Error('login failed (Ticket not found or MFA), please check username and password');
                        }
                        ticket = ticketRegResult[1];
                        return [2 /*return*/, ticket];
                }
            });
        });
    };
    // TODO: Handle MFA
    HttpClient.prototype.handleMFA = function (htmlStr) { };
    // TODO: Handle Phone number
    HttpClient.prototype.handlePageTitle = function (htmlStr) {
        var pageTitileRegResult = PAGE_TITLE_RE.exec(htmlStr);
        if (pageTitileRegResult) {
            var title = pageTitileRegResult[1];
            console.log('login page title:', title);
            if (lodash_1.default.includes(title, 'Update Phone Number')) {
                // current I don't know where to update it
                // See:  https://github.com/matin/garth/issues/19
                throw new Error("login failed (Update Phone number), please update your phone number, currently I don't know where to update it");
            }
        }
    };
    HttpClient.prototype.handleAccountLocked = function (htmlStr) {
        var accountLockedRegResult = ACCOUNT_LOCKED_RE.exec(htmlStr);
        if (accountLockedRegResult) {
            var msg = accountLockedRegResult[1];
            console.error(msg);
            throw new Error('login failed (AccountLocked), please open connect web page to unlock your account');
        }
    };
    HttpClient.prototype.refreshOauth2Token = function () {
        return __awaiter(this, void 0, void 0, function () {
            var oauth1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!!this.OAUTH_CONSUMER) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.fetchOauthConsumer()];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2:
                        if (!this.oauth2Token || !this.oauth1Token) {
                            throw new Error('No Oauth2Token or Oauth1Token');
                        }
                        oauth1 = {
                            oauth: this.getOauthClient(this.OAUTH_CONSUMER),
                            token: this.oauth1Token
                        };
                        return [4 /*yield*/, this.exchange(oauth1)];
                    case 3:
                        _a.sent();
                        console.log('Oauth2 token refreshed!');
                        return [2 /*return*/];
                }
            });
        });
    };
    HttpClient.prototype.getOauth1Token = function (ticket) {
        return __awaiter(this, void 0, void 0, function () {
            var params, url, oauth, step4RequestData, headers, response, token;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.OAUTH_CONSUMER) {
                            throw new Error('No OAUTH_CONSUMER');
                        }
                        params = {
                            ticket: ticket,
                            'login-url': this.url.GARMIN_SSO_EMBED,
                            'accepts-mfa-tokens': true
                        };
                        url = "".concat(this.url.OAUTH_URL, "/preauthorized?").concat(qs_1.default.stringify(params));
                        oauth = this.getOauthClient(this.OAUTH_CONSUMER);
                        step4RequestData = {
                            url: url,
                            method: 'GET'
                        };
                        headers = oauth.toHeader(oauth.authorize(step4RequestData));
                        return [4 /*yield*/, this.get(url, {
                                headers: __assign(__assign({}, headers), { 'User-Agent': USER_AGENT_CONNECTMOBILE })
                            })];
                    case 1:
                        response = _a.sent();
                        token = qs_1.default.parse(response);
                        // console.log('getOauth1Token - token:', token);
                        this.oauth1Token = token;
                        return [2 /*return*/, { token: token, oauth: oauth }];
                }
            });
        });
    };
    HttpClient.prototype.getOauthClient = function (consumer) {
        var oauth = new oauth_1_0a_1.default({
            consumer: consumer,
            signature_method: 'HMAC-SHA1',
            hash_function: function (base_string, key) {
                return crypto
                    .createHmac('sha1', key)
                    .update(base_string)
                    .digest('base64');
            }
        });
        return oauth;
    };
    //
    HttpClient.prototype.exchange = function (oauth1) {
        return __awaiter(this, void 0, void 0, function () {
            var token, baseUrl, requestData, step5AuthData, url, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        token = {
                            key: oauth1.token.oauth_token,
                            secret: oauth1.token.oauth_token_secret
                        };
                        baseUrl = "".concat(this.url.OAUTH_URL, "/exchange/user/2.0");
                        requestData = {
                            url: baseUrl,
                            method: 'POST',
                            data: null
                        };
                        step5AuthData = oauth1.oauth.authorize(requestData, token);
                        url = "".concat(baseUrl, "?").concat(qs_1.default.stringify(step5AuthData));
                        // console.log('exchange - url:', url);
                        this.oauth2Token = undefined;
                        return [4 /*yield*/, this.post(url, null, {
                                headers: {
                                    'User-Agent': USER_AGENT_CONNECTMOBILE,
                                    'Content-Type': 'application/x-www-form-urlencoded'
                                }
                            })];
                    case 1:
                        response = _a.sent();
                        // console.log('exchange - response:', response);
                        this.oauth2Token = this.setOauth2TokenExpiresAt(response);
                        return [2 /*return*/];
                }
            });
        });
    };
    HttpClient.prototype.setOauth2TokenExpiresAt = function (token) {
        // human readable date
        token['last_update_date'] = luxon_1.DateTime.now().toLocal().toString();
        token['expires_date'] = luxon_1.DateTime.fromSeconds(luxon_1.DateTime.now().toSeconds() + token['expires_in'])
            .toLocal()
            .toString();
        // timestamp for check expired
        token['expires_at'] = luxon_1.DateTime.now().toSeconds() + token['expires_in'];
        token['refresh_token_expires_at'] =
            luxon_1.DateTime.now().toSeconds() + token['refresh_token_expires_in'];
        return token;
    };
    return HttpClient;
}());
exports.HttpClient = HttpClient;
//# sourceMappingURL=HttpClient.js.map