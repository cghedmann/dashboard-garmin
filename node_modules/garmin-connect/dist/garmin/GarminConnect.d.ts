import { HttpClient } from '../common/HttpClient';
import { ExportFileTypeValue, GarminDomain, ICountActivities, IGarminTokens, IOauth1Token, IOauth2Token, ISocialProfile, IUserSettings, IWorkout, IWorkoutDetail, UploadFileTypeTypeValue } from './types';
import Running from './workouts/Running';
import { SleepData } from './types/sleep';
import { ActivitySubType, ActivityType, GCActivityId, IActivity } from './types/activity';
export type EventCallback<T> = (data: T) => void;
export interface GCCredentials {
    username: string;
    password: string;
}
export interface Listeners {
    [event: string]: EventCallback<any>[];
}
export declare enum Event {
    sessionChange = "sessionChange"
}
export interface Session {
}
export default class GarminConnect {
    client: HttpClient;
    private _userHash;
    private credentials;
    private listeners;
    private url;
    constructor(credentials?: GCCredentials | undefined, domain?: GarminDomain);
    login(username?: string, password?: string): Promise<GarminConnect>;
    exportTokenToFile(dirPath: string): void;
    loadTokenByFile(dirPath: string): void;
    exportToken(): IGarminTokens;
    loadToken(oauth1: IOauth1Token, oauth2: IOauth2Token): void;
    getUserSettings(): Promise<IUserSettings>;
    getUserProfile(): Promise<ISocialProfile>;
    getActivities(start?: number, limit?: number, activityType?: ActivityType, subActivityType?: ActivitySubType): Promise<IActivity[]>;
    getActivity(activity: {
        activityId: GCActivityId;
    }): Promise<IActivity>;
    countActivities(): Promise<ICountActivities>;
    downloadOriginalActivityData(activity: {
        activityId: GCActivityId;
    }, dir: string, type?: ExportFileTypeValue): Promise<void>;
    uploadActivity(file: string, format?: UploadFileTypeTypeValue): Promise<unknown>;
    deleteActivity(activity: {
        activityId: GCActivityId;
    }): Promise<void>;
    getWorkouts(start: number, limit: number): Promise<IWorkout[]>;
    getWorkoutDetail(workout: {
        workoutId: string;
    }): Promise<IWorkoutDetail>;
    addWorkout(workout: IWorkoutDetail | Running): Promise<IWorkoutDetail>;
    addRunningWorkout(name: string, meters: number, description: string): Promise<IWorkoutDetail>;
    deleteWorkout(workout: {
        workoutId: string;
    }): Promise<unknown>;
    getSteps(date?: Date): Promise<number>;
    getSleepData(date?: Date): Promise<SleepData>;
    getSleepDuration(date?: Date): Promise<{
        hours: number;
        minutes: number;
    }>;
    getDailyWeightData(date?: Date): Promise<WeightData>;
    getDailyWeightInPounds(date?: Date): Promise<number>;
    getDailyHydration(date?: Date): Promise<number>;
    updateWeight(date: Date | undefined, lbs: number, timezone: string): Promise<UpdateWeight>;
    updateHydrationLogOunces(date: Date | undefined, valueInOz: number): Promise<WaterIntake>;
    getGolfSummary(): Promise<GolfSummary>;
    getGolfScorecard(scorecardId: number): Promise<GolfScorecard>;
    getHeartRate(date?: Date): Promise<HeartRate>;
    get<T>(url: string, data?: any): Promise<T>;
    post<T>(url: string, data: any): Promise<T>;
    put<T>(url: string, data: any): Promise<T>;
}
