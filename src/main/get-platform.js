'use strict';

import {platform, pr} from 'os';

export const getPlatform = () => {
    switch (platform()) {
        case 'aix':
        case 'freebsd':
        case 'linux':
        case 'openbsd':
        case 'android':
            return 'linux';
        case 'darwin':
        case 'sunos':
            return 'mac';
        case 'win32':
            return 'win';
    }
};

export const getArch = () => {
    switch (process.arch) {
        case 'arm64': return "aarch64"
        default: return process.arch
    }
}