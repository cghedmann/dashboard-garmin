import { AxiosInstance, AxiosRequestConfig, AxiosResponse, RawAxiosRequestHeaders } from 'axios';
import OAuth from 'oauth-1.0a';
import { UrlClass } from '../garmin/UrlClass';
import { IOauth1, IOauth1Consumer, IOauth1Token, IOauth2Token } from '../garmin/types';
export declare class HttpClient {
    client: AxiosInstance;
    url: UrlClass;
    oauth1Token: IOauth1Token | undefined;
    oauth2Token: IOauth2Token | undefined;
    OAUTH_CONSUMER: IOauth1Consumer | undefined;
    constructor(url: UrlClass);
    fetchOauthConsumer(): Promise<void>;
    checkTokenVaild(): Promise<void>;
    get<T>(url: string, config?: AxiosRequestConfig<any>): Promise<T>;
    post<T>(url: string, data: any, config?: AxiosRequestConfig<any>): Promise<T>;
    put<T>(url: string, data: any, config?: AxiosRequestConfig<any>): Promise<T>;
    delete<T>(url: string, config?: AxiosRequestConfig<any>): Promise<T>;
    setCommonHeader(headers: RawAxiosRequestHeaders): void;
    handleError(response: AxiosResponse): void;
    handleHttpError(response: AxiosResponse): void;
    /**
     * Login to Garmin Connect
     * @param username
     * @param password
     * @returns {Promise<HttpClient>}
     */
    login(username: string, password: string): Promise<HttpClient>;
    private getLoginTicket;
    handleMFA(htmlStr: string): void;
    handlePageTitle(htmlStr: string): void;
    handleAccountLocked(htmlStr: string): void;
    refreshOauth2Token(): Promise<void>;
    getOauth1Token(ticket: string): Promise<IOauth1>;
    getOauthClient(consumer: IOauth1Consumer): OAuth;
    exchange(oauth1: IOauth1): Promise<void>;
    setOauth2TokenExpiresAt(token: IOauth2Token): IOauth2Token;
}
