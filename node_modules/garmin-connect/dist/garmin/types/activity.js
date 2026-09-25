"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivitySubType = exports.ActivityType = void 0;
var ActivityType;
(function (ActivityType) {
    ActivityType["Cycling"] = "cycling";
    ActivityType["FitnessEquipment"] = "fitness_equipment";
    ActivityType["Walking"] = "walking";
    ActivityType["Hiking"] = "hiking";
    ActivityType["Other"] = "other";
    ActivityType["WaterSport"] = "water_sports";
    ActivityType["Running"] = "street_running";
})(ActivityType = exports.ActivityType || (exports.ActivityType = {}));
var ActivitySubType;
(function (ActivitySubType) {
    ActivitySubType["IndoorCardio"] = "indoor_cardio";
    ActivitySubType["StrengthTraining"] = "strength_training";
    ActivitySubType["HIIT"] = "hiit";
    ActivitySubType["Yoga"] = "yoga";
    ActivitySubType["IndoorCycling"] = "indoor_cycling";
    ActivitySubType["Breathwork"] = "breathwork";
    ActivitySubType["Surfing"] = "surfing";
    ActivitySubType["StreetRunning"] = "street_running";
    ActivitySubType["TrailRunning"] = "trail_running";
    ActivitySubType["IndoorRunning"] = "indoor_running"; // Maps to Running
})(ActivitySubType = exports.ActivitySubType || (exports.ActivitySubType = {}));
//# sourceMappingURL=activity.js.map