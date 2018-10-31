'use strict';
Object.defineProperty( exports, "__esModule", { value: true } );

const vscode_1 = require( "vscode" );
const ChildProcess = require( "child_process" );
const Path = require( "path" );
const Fs = require( "fs" );

// vscode_1.window.showInformationMessage( "Message", 'Option1: Dismiss', 'Option:2 Never show again' );

class PugCompilerFileWatcher {
    constructor() { }
    watch( fn ) {
        var self = this;
        if ( self.filename )
            self.watcher = vscode_1.workspace.createFileSystemWatcher( self.filename );
        else if ( self.pattern )
            self.watcher = vscode_1.workspace.createFileSystemWatcher( self.pattern );
        self.watcher.onDidCreate( function ( event ) {
            self.eventType = 'created';
            if ( fn )
                fn( { filename: event.fsPath, eventType: self.eventType } );
        } );
        self.watcher.onDidChange( function ( event ) {
            self.eventType = 'changed';
            if ( fn )
                fn( { filename: event.fsPath, eventType: self.eventType } );
        } );
        self.watcher.onDidDelete( function ( event ) {
            self.eventType = 'deleted';
            if ( fn )
                fn( { filename: event.fsPath, eventType: self.eventType } );
        } );
    }
    dispose() {
        this.watcher.dispose();
    }
    static fromFile( file ) {
        var tfw = new PugCompilerFileWatcher();
        tfw.filename = Path.normalize( file );
        return tfw;
    }
    static FromPattern( pattern ) {
        var tfw = new PugCompilerFileWatcher();
        tfw.pattern = pattern;
        return tfw;
    }
}
class PugCompilerStatusChannel {
    constructor() {
        if ( !this.statusItem )
            this.statusItem = vscode_1.window.createStatusBarItem( vscode_1.StatusBarAlignment.Right );
    }
    updateStatus( shortText, longTooltip, color ) {
        this.statusItem.tooltip = longTooltip;
        this.statusItem.text = shortText;
        this.statusItem.color = color;
        this.statusItem.show();
    }
    dispose() {
        if ( this.statusItem )
            this.statusItem.dispose();
    }
}
class PugCompiler {
    constructor() {
        this.watchers = {};
        this.pugConfigCompileOnSave = true;
        this.configurations = { alertOnError: 'alertOnError' };
        var self = this;
        self.statusChannel = new PugCompilerStatusChannel();
        self.statusChannel.updateStatus( '$(zap) PUG [...]', 'Pug Auto Compiler - warming up...', 'white' );
        if ( !self.output )
            self.output = vscode_1.window.createOutputChannel( "Pug Auto Compiler" );
        {
            let pattern = new vscode_1.RelativePattern( vscode_1.workspace.workspaceFolders[ 0 ], '**/*.pug' );
            let watcher = PugCompilerFileWatcher.FromPattern( pattern );
            watcher.watch( e => {
                if ( e.filename )
                    self.compile( e.filename );
            } );
            self.watchers[ pattern.pattern ] = watcher;
        }
        self.statusChannel.updateStatus( '$(eye) PUG [ON]', 'Pug Auto Compiler is ON - Watching file changes.', 'white' );
    }
    dispose() {
        this.statusChannel.dispose();
        this.output.dispose();
        [].forEach.call( this.watchers, watch => {
            watch.dispose();
        } );
    }
    readConfiguration( key, defaultValue ) {
        // Reading existing configurations for extensions
        var configurationNode = vscode_1.workspace.getConfiguration( `vscode.pug.compiler` );
        return configurationNode.get( key, defaultValue );
    }
    setConfiguration( key, value ) {
        var configurationNode = vscode_1.workspace.getConfiguration( `vscode.pug.compiler` );
        return configurationNode.update( key, value, vscode_1.ConfigurationTarget.Workspace );
    }
    getNodeModulesBinPath() {
        return new Promise( ( resolve, reject ) => {
            ChildProcess.exec( 'npm bin', { cwd: vscode_1.workspace.rootPath }, ( error, stdout, stderr ) => {
                if ( error )
                    resolve( '' );
                else
                    resolve( stdout.trim() );
            } );
        } );
    }
    getNodeModules() {
        return new Promise( ( resolve, reject ) => {
            ChildProcess.exec( 'npm ls --json', { cwd: vscode_1.workspace.rootPath }, ( error, stdout, stderr ) => {
                if ( error )
                    resolve( null );
                else
                    resolve( JSON.parse( stdout.trim() ) );
            } );
        } );
    }
    findSpecificModule( modules, name ) {
        return new Promise( ( resolve, reject ) => {
            if ( !modules )
                resolve( false );
            else
                resolve( modules.dependencies != null ? modules.dependencies[ name ] != null : false );
        } );
    }
    testPugPathEnvironment() {
        return new Promise( ( resolve, reject ) => {
            ChildProcess.exec( 'pug --version', { cwd: vscode_1.workspace.rootPath }, ( error, stdout, stderr ) => {
                if ( error ) { resolve( false ); } else { resolve( true ); }
            } );
        } );
    }
    definePugCompiler() {
        var binPath;
        return new Promise( ( resolve, reject ) => {
            this.getNodeModulesBinPath()
                .then( path => {
                    binPath = path;
                    return this.getNodeModules();
                } )
                .then( modules => {
                    return this.findSpecificModule( modules, 'pug' );
                } )
                .then( exists => {
                    if ( exists )
                        resolve( `${binPath}\\pug` );
                    else
                        return this.testPugPathEnvironment();
                } )
                .then( existsEnv => {
                    if ( !existsEnv )
                        reject( `There is no Pug compiler available for this workspace. Try to install via npm install pug command.` );
                    else
                        resolve( 'pug' );
                } );
        } );
    }
    compile( fspath ) {
        var self = this;
        // if ( !this.pugConfigCompileOnSave ) {
        //     vscode_1.window.setStatusBarMessage( `MESSAGE`, 5000 );
        //     self.statusChannel.updateStatus( '$(alert) Pug [ON]', `Pug Auto Compiler can't build on save`, 'tomato' );
        //     return;
        // }
        var filename = Path.basename( fspath );
        var ext = Path.extname( filename ).toLowerCase();
        if ( ext == '.pug' ) {
            self.statusChannel.updateStatus( '$(beaker) Pug [ ... ]', 'Pug Auto Compiler is ON - Compiling changes...', 'cyan' );
            var status = "Auto compiling file \'" + filename + "\'";
            vscode_1.window.setStatusBarMessage( status, 5000 );
            self.output.appendLine( status );
            this.definePugCompiler()
                .then( pug => {
                    vscode_1.window.showInformationMessage( pug );
                    var command = `${pug} --pretty ${fspath}`;
                    if ( self.tsconfig ) {
                        command = `${pug} -p \"${self.tsconfig}\"`;
                        self.output.appendLine( "Using tsconfig.json at \'" + self.tsconfig + "\'" );
                    }
                    ChildProcess.exec( command, { cwd: vscode_1.workspace.rootPath }, ( error, stdout, stderr ) => {
                        self.statusChannel.updateStatus( '$(eye) PUG [ON]', 'Pug Auto Compiler is ON - Watching file changes.', 'white' );
                        if ( error ) {
                            // self.output.show();
                            self.output.appendLine( error.message );
                            self.output.appendLine( stdout.trim().toString() );
                            self.output.appendLine( '' );
                            const showError = this.readConfiguration( self.configurations.alertOnError, 'always' );
                            showError === 'always' ?
                                vscode_1.window.showInformationMessage( `Compile errors ocurred while building .ts files.`, 'Dismiss', 'Show output', 'Never show again' )
                                    .then( opted => {
                                        if ( opted === 'Show output' )
                                            self.output.show();
                                        else if ( opted === 'Never show again' ) {
                                            this.setConfiguration( self.configurations.alertOnError, 'never' );
                                        }
                                    } )
                                : console.log( `Not showing error informational message` );
                            vscode_1.window.setStatusBarMessage( error.message, 5000 );
                        } else {
                            var successMsg = 'Pug Auto Compilation succedded.';
                            vscode_1.window.setStatusBarMessage( successMsg, 5000 );
                            self.output.appendLine( successMsg );
                            self.output.appendLine( '' );
                        }
                    } );
                } )
                .catch( error => {
                    self.statusChannel.updateStatus( '$(alert) PUG [ON]', 'Pug Auto Compiler encountered an errror.', 'tomato' );
                    vscode_1.window.showInformationMessage( error, 'Dismiss' );
                } );
        }
    }
}

// Called when extension is activated (the first time the command is executed)
function activate( context ) {
    console.log( 'Extension "pug-auto-compiler" is now active!' );
    let compiler = new PugCompiler();
    // let disposable = commands.registerCommand('extension.sayHello', () => { window.showInformationMessage('Hello World!'); });
    context.subscriptions.push( compiler );
}
exports.activate = activate;

// Called when extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
