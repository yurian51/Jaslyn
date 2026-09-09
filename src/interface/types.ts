export type InterfaceChannel="web"|"mobile"|"whatsapp"|"api"|"voice";
export interface InterfaceRequest{channel:InterfaceChannel;sessionId:string;message:string;metadata?:Record<string,unknown>;}
