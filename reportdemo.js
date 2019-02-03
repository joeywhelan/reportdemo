/**
 * @fileoverview Simple demonstration of the use of the InContact Reporting API
 * @author Joey Whelan <joey.whelan@gmail.com>
 */

'use strict';
'use esversion 6';
/*jshint esversion: 6 */

const fetch = require('node-fetch');
const btoa = require('btoa');
const atob = require('atob');
const fs = require('fs');
const util = require('util');
const writeFile = util.promisify(fs.writeFile);

const app = 'yourApp';
const vendor = 'yourVendor';
const reportId = 'yourId';
const bu = 'yourBu';
const username = 'yourName';
const password = 'yourPwd';
const outfile = 'report.csv';

/** @desc Class providing an object wrapper for REST calls to the InContact Reporting API. */
class CustomReport {
	
	/** 
	 * @param {string} app InContact app name for API access
	 * @param {string} vendor InContact vendor name for API access
	 * @param {string} bu InContact business unit
	 * @param {string} username InContact username
	 * @param {string} password InContact password
	 */
	constructor(app, vendor, bu, username, password) {
		this.authCode = btoa(app + '@' + vendor + ':' + bu);
		this.username = username;
		this.password = password;
	}
	
	/**
	 * Uses a base64-encoded key to make an request for a password-grant API token.  Will propagate exceptions.
	 * @return {Promise} Promise object representing the result of fetching an API token
	 */
	getToken() {
		console.log('getToken()');
		const url = 'https://api.incontact.com/InContactAuthorizationServer/Token';
		const body = {
				'grant_type' : 'password',
				'username' : this.username,
				'password' : this.password
		};
		return fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type' : 'application/json', 
				'Authorization' : 'basic ' + this.authCode
			},
			cache: 'no-store',
		    mode: 'cors'
		})
		.then(response => {
			if (response.ok) {
				return response.json();
			}
			else {
				const msg = 'response status: ' + response.status;
				throw new Error(msg);
			}	
		})
		.then(json => {
			if (json && json.access_token && json.resource_server_base_uri) {
				return json;
			}
			else {
				const msg = 'missing token and/or uri';
				throw new Error(msg);
			}
		})
		.catch(err => {
			console.error('getToken() - ' + err.message);
			throw err;
		});
	}

	/**
	 * Kicks off custom reporting job
	 * @param {string} reportID custom report ID
	 * @param {string} reportURL base URL for the reporting API
	 * @param {string} token InContact API token
	 * @return {Promise} Promise object representing the jobId of the reporting job
	 */
	startReportJob(reportId, reportURL, token) {
		const url = reportURL + reportId;
		console.log('startReportJob() - url: ' + url);
		const body = {
				'fileType': 'CSV',
				'includeHeaders': 'true',
				'appendDate': 'true',
				'deleteAfter': '7',
				'overwrite': 'true'
		};
		
		return fetch(url, {
			method: 'POST',
			body: JSON.stringify(body),
			headers: {
				'Content-Type' : 'application/json', 
				'Authorization' : 'bearer ' + token
			},
			cache: 'no-store',
			mode: 'cors'
		})
		.then(response => {
			if (response.ok) {
				return response.json();
			}
			else {
				const msg = 'response status: ' + response.status;
				throw new Error(msg);
			}
		})
		.then(json => {
				return json.jobId;
		})
		.catch(err => {
			console.error('startReportJob() - ' + err.message);
			throw err;
		});
	}
	
	/**
	 * Checks on the status of a reporting job.  Loops for a user-defined number of retries waiting for the job to complete.
	 * By default, waits up to 10 minutes for a job to complete.
	 * @param {string} jobId id of the reporting job
	 * @param {string} reportURL base URL for the reporting API
	 * @param {string} token InContact API token
	 * @param {integer} numTries number of times to retry while waiting for a job to finish
	 * @return {Promise} Promise object with URL of the report file location
	 */
	getFileURL(jobId, reportURL, token, numTries=10) {
		console.log('getFileURL() - jobId: ' + jobId + ' numTries: ' + numTries);
		const that = this;
		const url = reportURL + jobId;
		
		return fetch(url, {
			method: 'GET',
			headers: {
				'Content-Type' : 'application/x-www-form-urlencoded', 
				'Authorization' : 'bearer ' + token
			},
			cache: 'no-store',
			mode: 'cors'
		})
		.then(response => {
			if (response.ok) {
				return response.json();
			}
			else {
				const msg = 'response status: ' + response.status;
				throw new Error(msg);
			}
		})
		.then(json => {
			if (json.jobResult.resultFileURL) {
				return json.jobResult.resultFileURL;
			}
			else {
				if (numTries > 0) {  //loop (recursive) up to the numTries parameter
					return new Promise((resolve, reject) => {
						setTimeout(() => { 
							resolve(that.getFileURL(jobId, reportURL, token, numTries-1));
						}, 60000);  //retry once per minute
					});
				}
				else {
					throw new Error('Maximum retries reached');
				}	
			}
		})
		.catch(err => {
			console.error('getFileURL() - ' + err.message);
			throw err;
		});
	}
	
	/**
	 * Pulls down the report data.  Fetchs the base64-encoded data of the report.
	 * @param {string} URL InContact API file fetch url
	 * @param {string} token InContact API token
	 * @return {Promise} Promise object with base64 data
	 */
	downloadReport(url, token) {
		console.log('downLoadReport() - url: ' + url);
		
		return fetch(url, {
			method: 'GET',
			headers: {'Authorization' : 'bearer ' + token},
			cache: 'no-store',
			mode: 'cors'
		})
		.then(response => {
			if (response.ok) {
				return response.json();
			}
			else {
				const msg = 'response status: ' + response.status;
				throw new Error(msg);
			}
		})
		.then(json => {
				return json.files.file;
		})
		.catch(err => {
			console.error('downloadReport() - ' + err.message);
			throw err;
		});
	}
	
	/**
	 * Main procedure.  Chains promises to get an API token, start a reporting job, check status/get file URL of the resulting job,
	 * download the base64-encoded string of the job, convert that string to binary and write it to a local file.
	 * @param {string} reportId ID of the custom report template to be executed
	 * @param {string} target name of filename where report data is to be written
	 * @return none
	 */
	getReport(reportId, target) {
		console.log('getReport() - reportId: ' + reportId);
		let token, reportURL;
		const version = 'v13.0';
		
		return this.getToken()
			.then(data => {   
				token = data.access_token;
				reportURL = `${data.resource_server_base_uri}services/${version}/report-jobs/`;
				return this.startReportJob(reportId, reportURL, token);
			})
			.then(jobId => { 
				return this.getFileURL(jobId, reportURL, token);
			})
			.then(url => {
				return this.downloadReport(url, token);
			})
			.then(file => {
				return writeFile(target, atob(file));
			})
			.then(() => {
				console.log('Job Complete');
			})
			.catch(err => {
				console.error('loadReport() - ' + err.message);
			});
	}
}

const report = new CustomReport(app, vendor, bu, username, password);
report.getReport(reportId, outfile);
