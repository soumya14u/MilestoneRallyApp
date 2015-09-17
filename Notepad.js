Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    
    launch: function() {
    
        //this._lookupInArtifactList();
        this._lookupInMilestoneList();
      
    },
    
    _lookupInMilestoneList: function() {
       Ext.create("Rally.data.wsapi.Store", {
            model: 'milestone',
            fetch: ['FormattedID', 'Name', 'Artifacts'],
            context: {
                workspace: this.getContext().getWorkspace()._Ref,
                projectScopeUp: false,
                projectScopeDown: true
            },
            limit: Infinity,
            sorters: [
                {
                    property: 'Name',
                    direaction: 'ASC'
                }]
        }).load().then({
            success: this._loadArtifacts,
            scope: this
        }).then({
            success:function(results) {
                console.log('Final results: ', results);
            },
            failure: function(){
                console.log("oh something is wrong!");
            }
        }); 
    },
    
     _loadArtifacts: function(milestones){
        //console.log("load features started");
        var promises = [];
        _.each(milestones, function(milestone){
            var artifacts = milestone.get('Artifacts');
            if (artifacts.Count > 0) {
                artifacts.store = milestone.getCollection('Artifacts',{fetch:['FormattedID', 'Name', 'Project', 'Owner', 'Children', '_type']});
                promises.push(artifacts.store.load());
            }
        });
        return Deft.Promise.all(promises);
    }
});