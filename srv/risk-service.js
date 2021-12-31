// Imports
const cds = require("@sap/cds");

// The service implementation with all service handlers
module.exports = cds.service.impl(async function() {
    // Define constants for the Risk and BusinessPartners entities from the risk-service.cds file
    // eslint-disable-next-line no-unused-vars
    const { Risks, BusinessPartners } = this.entities;

    // Set criticality after a READ operation on /risks
    this.after("READ", Risks, (data) => {
        const risks = Array.isArray(data) ? data : [data];

        risks.forEach ((risk) => {
            if (risk.impact >= 100000) {
                risk.criticality = 1;
            }
            else { 
                if (risk.impact >= 50000) {
                risk.criticality = 2;
                }
                else risk.criticality = 5;
            }
        });
    });

    // Connect to remote service
    const BPsrv = await cds.connect.to("API_BUSINESS_PARTNER");

    // Event handler for read-events on the BusinessPartners entity.
    // Each request to the API Business Hub requires the apikey in the header.
    this.on("READ", BusinessPartners, async (req) => {
        //The API sandbox returns a lot of business partners with empty names.
        //We don't want them in our application
        req.query.where("LastName <> '' and FirstName <> '' ");
        return await BPsrv.transaction(req).send({
            query: req.query,
            headers: {
                apikey: 'GytwvCd87v9xkoDDrvrAo92ZSriJfRVK',
            },
        });
    });

    // Check if the request wants an expand of the BP. If this is the case remove it.
    this.on("READ", Risks, async(req, next) => {
        console.log(req.query.SELECT.columns);
        if ( typeof req.query.SELECT.columns == 'undefined' ) return next();
        const expandIndex = req.query.SELECT.columns.findIndex(({expand, ref}) => expand && ref[0] === "bp")
        
        if ( expandIndex < 0 ) return next();
        req.query.SELECT.columns.splice(expandIndex, 1);
        if ( !req.query.SELECT.columns.find((column) => column.ref.find((ref) => ref == "bp_BusinessPartner")) ) {
            req.query.SELECT.columns.push({ ref : ["bp_BusinessPartner"] });
        }
    // Instead of the expand, issue a separate request for each BP
        try{
            const res = await next();
            await Promise.all(
                res.map(async (risk) => {
                    const bp = await BPsrv.transaction(req).send(
                        { query: SELECT.one(this.entities.BusinessPartners)
                            .where({ BusinessPartner: risk.bp_BusinessPartner })
                            .columns(["BusinessPartner", "LastName", "FirstName"]),
                          headers: {
                            apikey: 'GytwvCd87v9xkoDDrvrAo92ZSriJfRVK',
                          }
                        }
                    );
                    risk.bp = bp;
                })
            );
        // eslint-disable-next-line no-empty
        }   catch (error) { }
    }
    );
});
