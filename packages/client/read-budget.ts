/** Optional shared accounting of actual consumed response-body chunks across clients. */
export interface ResponseReadBudget {consume(bytes:number):void}
