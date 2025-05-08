/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { BULL_BOARD_USER, BULL_BOARD_PASS } from '../utils/constants';

export interface QueueConfig {
	[key: string]: Queue;
}

export class BullBoardConfig {
    private serverAdapter: ExpressAdapter;
    private readonly basePath = '/admin/queues';
    private board: any; // Store the board instance

    constructor() {
        this.serverAdapter = new ExpressAdapter();
        this.serverAdapter.setBasePath(this.basePath);
    }

    private createBasicAuthMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) {
        const auth = req.headers.authorization;

        if (!auth || auth.indexOf('Basic ') === -1) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
            return res.status(401).json({ message: 'Authentication required' });
        }

        const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
        const username = credentials[0];
        const password = credentials[1];

        if (username === BULL_BOARD_USER && password === BULL_BOARD_PASS) {
            next();
        } else {
            res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    }

    initialize(queues: QueueConfig) {
        // Create Bull Board instance
        this.board = createBullBoard({
            queues: Object.values(queues).map(queue => new BullMQAdapter(queue)),
            serverAdapter: this.serverAdapter,
        });
    }

    getRouter() {
        return [this.createBasicAuthMiddleware.bind(this), this.serverAdapter.getRouter()];
    }

    mount(app: express.Application) {
        if (!this.board) {
            throw new Error('Bull Board must be initialized before mounting');
        }

        app.use(this.basePath, this.getRouter());
        console.log(`🐂 Bull Board is available at ${this.basePath}`);
    }
}

export const bullBoard = new BullBoardConfig();
