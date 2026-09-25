"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeToFile = exports.createDirectory = exports.checkIsDirectory = void 0;
var fs = __importStar(require("fs"));
var checkIsDirectory = function (filePath) {
    return fs.existsSync(filePath) && fs.lstatSync(filePath).isDirectory();
};
exports.checkIsDirectory = checkIsDirectory;
var createDirectory = function (directoryPath) {
    fs.mkdirSync(directoryPath);
};
exports.createDirectory = createDirectory;
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
var writeToFile = function (filePath, data) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    fs.writeFileSync(filePath, data, function (error) {
        if (error)
            throw error;
    });
};
exports.writeToFile = writeToFile;
//# sourceMappingURL=utils.js.map