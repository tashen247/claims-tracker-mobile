#!/bin/sh
# Creates the local photo bucket and allows browser/device uploads via pre-signed URLs.
awslocal s3 mb s3://claims-photos-local
awslocal s3api put-bucket-cors --bucket claims-photos-local --cors-configuration '{
  "CORSRules": [{
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}'
