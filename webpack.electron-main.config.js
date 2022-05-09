const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

module.exports = [
    {
        mode: "development",
        target: "electron-main",
        entry: './src/main/index.ts',
        devtool: "source-map",
        module: {
            rules: [{
                test: /\.ts$/,
                use: {
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: true,
                    },
                },
            }]
        },
        resolve: {
            extensions: ['.ts', '.js']
        },
        output: {
            path: __dirname + "/dist/app",
            filename: 'main.js',
            publicPath: "/"
        },
        plugins: [new ForkTsCheckerWebpackPlugin()]
    }]
