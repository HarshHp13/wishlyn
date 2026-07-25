/* eslint-disable @typescript-eslint/no-explicit-any */
declare module 'razorpay' {
  class Razorpay {
    constructor(options: { key_id: string; key_secret: string });
    orders: {
      create(options: {
        amount: number;
        currency: string;
        receipt?: string;
        notes?: Record<string, string>;
      }): Promise<any>;
    };
  }
  export default Razorpay;
}
