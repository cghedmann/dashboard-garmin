"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var RunningTemplate_1 = __importDefault(require("./templates/RunningTemplate"));
var Running = /** @class */ (function () {
    function Running() {
        this.data = (0, RunningTemplate_1.default)();
    }
    Object.defineProperty(Running.prototype, "name", {
        get: function () {
            return this.data.workoutName;
        },
        set: function (name) {
            this.data.workoutName = "".concat(name);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Running.prototype, "distance", {
        get: function () {
            return (this.data.workoutSegments[0].workoutSteps[0].endConditionValue || 0);
        },
        set: function (meters) {
            this.data.workoutSegments[0].workoutSteps[0].endConditionValue =
                Math.round(meters);
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Running.prototype, "workoutId", {
        get: function () {
            return this.data.workoutId;
        },
        set: function (workoutId) {
            this.data.workoutId = workoutId;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(Running.prototype, "description", {
        get: function () {
            return this.data.description;
        },
        set: function (description) {
            this.data.description = description;
        },
        enumerable: false,
        configurable: true
    });
    Running.prototype.isValid = function () {
        return !!(this.name && this.distance);
    };
    Running.prototype.toJson = function () {
        return this.data;
    };
    Running.prototype.toString = function () {
        return "".concat(this.name, ", ").concat((this.distance / 1000).toFixed(2), "km");
    };
    return Running;
}());
exports.default = Running;
//# sourceMappingURL=Running.js.map