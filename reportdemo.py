'''
 Simple demonstration of the use of the InContact Reporting API
@author: Joey Whelan <joey.whelan@gmail.com>
'''

import requests
import base64
import time

app = 'yourApp'
vendor = 'yourVendor'
reportId = 'yourId'
bu = 'yourBu'
username = 'yourName'
password = 'yourPwd'
outfile = 'report.csv'


class CustomReport(object):
    """Class providing an object wrapper for REST calls to the InContact Reporting API. 
    """
    def __init__(self, app, vendor, bu, username, password):
        """Initializes state variables for class.
        
        Args:
            self: Instance reference 
            app: InContact app name for API access
            vendor: InContact vendor name for API access
            bu: InContact business unit
            username: InContact username
            password: InContact password
        
        Returns:
            None
        
        Raises:
            None
        """
        auth = app + '@' + vendor + ':' + bu
        self.authCode = base64.b64encode(auth.encode());
        self.username = username;
        self.password = password;
    
    def getToken(self):
        """Uses a base64-encoded key to make an request for a password-grant API token.  Will propagate exceptions.
        
        Args:
            self: Instance reference 
        
        Returns:
            JSON object containing the API token and base URL
        
        Raises:
            HTTPError:  Any sort of HTTP 400/500 response returned from InContact.
        """
        print('getToken()')
        url = 'https://api.incontact.com/InContactAuthorizationServer/Token'
        header = {'Authorization' : b'basic ' + self.authCode, 'Content-Type': 'application/json'}
        body =  {'grant_type' : 'password', 'username' : self.username, 'password' : self.password}
        resp = requests.post(url, headers=header, json=body)
        resp.raise_for_status()
        return resp.json()

    def startReportJob(self, reportId, reportURL, token):
        """Kicks off custom reporting job.  Will propagate exceptions.
        
        Args:
            self: Instance reference 
            reportId:  String. reportID custom report ID
            reportURL: String. base URL for the reporting API
            token: String.  InContact API token 
        
        Returns:
            String.  jobId of the reporting job
        
        Raises:
            HTTPError:  Any sort of HTTP 400/500 response returned from InContact.
        """
        url = reportURL + reportId
        print('startReportJob() - url: ' + url);
        body = {
                'fileType': 'CSV',
                'includeHeaders': 'true',
                'appendDate': 'true',
                'deleteAfter': '7',
                'overwrite': 'true'
        }
        header = { 'Content-Type' : 'application/json', 'Authorization' : 'bearer ' + token}
        resp = requests.post(url, headers=header, json=body)
        resp.raise_for_status()
        return resp.json()['jobId']
    
    def getFileURL(self, jobId, reportURL, token):
        """Checks on the status of a reporting job.  Loops for up to 10 retries waiting for the job to complete.
            By default, waits up to 10 minutes for a job to complete.
        
        Args:
            self: Instance reference 
            jobId:  String. id of the reporting job
            reportURL: String. base URL for the reporting API
            token: String.  InContact API token 
        
        Returns:
            String.  URL of the report file location
        
        Raises:
            HTTPError:  Any sort of HTTP 400/500 response returned from InContact.
        """
        url = reportURL + jobId
        header = { 'Content-Type' : 'application/x-www-form-urlencoded', 'Authorization' : 'bearer ' + token }
        resp = requests.get(url, headers=header)
        fileURL = resp.json()['jobResult']['resultFileURL']
        numTries = 10
        
        while (not fileURL and numTries > 0):
            print('getFileURL() - jobId: ' + jobId + ' numTries: ' + str(numTries))
            time.sleep(60)
            resp = requests.get(url, headers=header)
            fileURL = resp.json()['jobResult']['resultFileURL']
            numTries -= 1
        
        return fileURL
    
    def downloadReport(self, url, token):
        """Pulls down the report data.  Fetchs the base64-encoded data of the report.
  
        Args:
            self: Instance reference 
            url:  String. InContact API file fetch url
            token: String.  InContact API token 
        
        Returns:
            String.  base64 data
        
        Raises:
            HTTPError:  Any sort of HTTP 400/500 response returned from InContact.
        """
        print('downLoadReport() - url: ' + url)
        header = { 'Content-Type' : 'application/x-www-form-urlencoded', 'Authorization' : 'bearer ' + token }
        resp = requests.get(url, headers=header)
        return resp.json()['files']['file']   
       
    def getReport(self, reportId, target):
        """Main procedure.  Performs a series of InContact API calls to get an API token, start a reporting job, 
        check status/get file URL of the resulting job, download the base64-encoded string of the job, 
        and convert that string to binary and write it to a local file.
  
        Args:
            self: Instance reference 
            reportId:  String. ID of the custom report template to be executed
            target:  String. name of filename where report data is to be written
        
        Returns:
            none
        
        Raises:
            HTTPError:  Any sort of HTTP 400/500 response returned from InContact.
        """
        print('getReport() - reportId: ' + reportId)
        version = 'v13.0'
        
        json = self.getToken()
        reportURL = json['resource_server_base_uri'] + 'services/' + version + '/report-jobs/'
        token = json['access_token']
        jobId = self.startReportJob(reportId, reportURL, token)
        url = self.getFileURL(jobId, reportURL, token)
        b64bytes = self.downloadReport(url, token)
        file = open(target, 'w')
        file.write(base64.b64decode(b64bytes).decode('utf-8'))
        file.close()
        print('Job Complete')
        
        
if __name__ == '__main__':    
    report = CustomReport(app, vendor, bu, username, password)
    report.getReport(reportId, outfile)
