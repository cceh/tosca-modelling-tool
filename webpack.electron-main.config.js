const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const tsRule = {
    test: /\.ts$/,
    use: {
        loader: 'ts-loader',
        options: {
            transpileOnly: true,
        },
    },
}

module.exports = [
    {
        mode: "development",
        target: "electron-main",
        entry: './src/main/index.ts',
        devtool: "source-map",
        module: {
            rules: [tsRule]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        output: {
            path: __dirname + "/dist/app",
            filename: 'main.js',
            publicPath: "/"
        },
        node: {
            __dirname: false // why? https://stackoverflow.com/questions/43796358/how-do-i-compile-a-preload-script-w-webpack-in-electron
        },
        plugins: [new ForkTsCheckerWebpackPlugin()]
    }, {
        mode: 'development',
        entry: './src/preload/preload.ts',
        target: 'electron-preload',
        devtool: 'source-map',
        watch: (!!process.env["WATCH_PRELOAD"]),
        watchOptions: {
            ignored: /node_modules/,
        },
        module: {
            rules: [tsRule]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        output: {
            path: __dirname + "/dist/app",
            filename: "preload.js",
        }
    }]
